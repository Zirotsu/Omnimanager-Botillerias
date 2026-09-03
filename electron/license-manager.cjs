const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const PRODUCT_ID = 'omnimanager-botillerias';
const TOKEN_PREFIX = 'OMNI-BOT1';
const DEMO_DAYS = 7;
const CLOCK_SKEW_MS = 5 * 60 * 1000;
const REGISTRY_KEY = 'HKCU\\Software\\HelixFix\\OmniManagerBotillerias';

const b64urlDecode = value => Buffer.from(String(value || ''), 'base64url');
const nowIso = () => new Date().toISOString();

function runReg(args) {
  if (process.platform !== 'win32') return '';
  try {
    return execFileSync('reg.exe', args, {
      encoding: 'utf8',
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore']
    });
  } catch {
    return '';
  }
}

function readRegistryValue(name) {
  const output = runReg(['query', REGISTRY_KEY, '/v', name]);
  const line = output.split(/\r?\n/).find(row => row.includes(name));
  if (!line) return '';
  const parts = line.trim().split(/\s{2,}/);
  return parts.at(-1) || '';
}

function writeRegistryValue(name, value) {
  runReg(['add', REGISTRY_KEY, '/v', name, '/t', 'REG_SZ', '/d', String(value), '/f']);
}

function readWindowsMachineGuid() {
  if (process.platform !== 'win32') return '';
  const output = runReg(['query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid']);
  const line = output.split(/\r?\n/).find(row => row.includes('MachineGuid'));
  if (!line) return '';
  return line.trim().split(/\s{2,}/).at(-1) || '';
}

function machineFingerprint() {
  const machineGuid = readWindowsMachineGuid();
  const fallback = [
    os.hostname(),
    process.arch,
    process.env.COMPUTERNAME || '',
    process.env.PROCESSOR_IDENTIFIER || '',
    process.env.SystemRoot || '',
    os.cpus()?.[0]?.model || ''
  ].join('|');
  return crypto.createHash('sha256').update(machineGuid || fallback).digest('hex');
}

function installationIdFromFingerprint(fingerprint) {
  return `OMB-${fingerprint.slice(0, 12).toUpperCase()}`;
}

function deriveStateKey(fingerprint) {
  return crypto.createHash('sha256')
    .update(`omnimanager-botillerias-license-state:v1|${fingerprint}`)
    .digest();
}

function sealState(state, fingerprint) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', deriveStateKey(fingerprint), iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(state), 'utf8'),
    cipher.final()
  ]);
  const tag = cipher.getAuthTag();
  return JSON.stringify({
    v: 1,
    iv: iv.toString('base64url'),
    tag: tag.toString('base64url'),
    data: encrypted.toString('base64url')
  });
}

function openState(raw, fingerprint) {
  const parsed = JSON.parse(raw);
  if (parsed?.v !== 1) throw new Error('Estado de licencia no compatible.');
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    deriveStateKey(fingerprint),
    b64urlDecode(parsed.iv)
  );
  decipher.setAuthTag(b64urlDecode(parsed.tag));
  const clear = Buffer.concat([
    decipher.update(b64urlDecode(parsed.data)),
    decipher.final()
  ]).toString('utf8');
  return JSON.parse(clear);
}

class LicenseManager {
  constructor({ userDataPath, resourcesPath }) {
    this.fingerprint = machineFingerprint();
    this.installationId = installationIdFromFingerprint(this.fingerprint);
    this.licenseDir = path.join(userDataPath, 'license');
    this.statePath = path.join(this.licenseDir, 'license-state.dat');
    this.resourcesPath = resourcesPath;
    fs.mkdirSync(this.licenseDir, { recursive: true });
  }

  getInstallationId() {
    return this.installationId;
  }

  readState() {
    if (!fs.existsSync(this.statePath)) return {};
    try {
      return openState(fs.readFileSync(this.statePath, 'utf8'), this.fingerprint);
    } catch {
      return { stateCorrupted: true };
    }
  }

  writeState(state) {
    fs.mkdirSync(this.licenseDir, { recursive: true });
    const tempPath = `${this.statePath}.tmp`;
    fs.writeFileSync(tempPath, sealState(state, this.fingerprint), 'utf8');
    fs.renameSync(tempPath, this.statePath);
  }

  getPublicKey() {
    const fromEnv = String(process.env.OMNI_LICENSE_PUBLIC_KEY || '').trim();
    if (fromEnv) return fromEnv.replace(/\\n/g, '\n');

    const candidates = [
      path.join(this.resourcesPath || '', 'license-public-key.pem'),
      path.join(__dirname, '../build/license-public-key.pem')
    ];
    const keyPath = candidates.find(candidate => candidate && fs.existsSync(candidate));
    return keyPath ? fs.readFileSync(keyPath, 'utf8') : '';
  }

  verifyCommercialToken(token) {
    const [prefix, encodedPayload, encodedSignature] = String(token || '').trim().split('.');
    if (prefix !== TOKEN_PREFIX || !encodedPayload || !encodedSignature) {
      throw new Error('La licencia no tiene un formato válido.');
    }

    const publicKey = this.getPublicKey();
    if (!publicKey) {
      throw new Error('Este ejecutable aún no tiene configurada la llave pública de licencias comerciales.');
    }

    const verified = crypto.verify(
      null,
      Buffer.from(encodedPayload, 'utf8'),
      publicKey,
      b64urlDecode(encodedSignature)
    );
    if (!verified) throw new Error('La firma de la licencia no es válida.');

    let payload;
    try {
      payload = JSON.parse(b64urlDecode(encodedPayload).toString('utf8'));
    } catch {
      throw new Error('El contenido de la licencia está dañado.');
    }

    if (payload?.v !== 1 || payload?.product !== PRODUCT_ID) {
      throw new Error('La licencia pertenece a otro producto.');
    }
    if (!['monthly', 'annual'].includes(payload.plan)) {
      throw new Error('El tipo de licencia no es compatible.');
    }
    if (payload.machineId !== this.installationId) {
      throw new Error(`La licencia corresponde a otro PC. Código de este equipo: ${this.installationId}.`);
    }

    const now = Date.now();
    const notBefore = Date.parse(payload.notBefore || payload.issuedAt || '');
    const expiresAt = Date.parse(payload.expiresAt || '');
    if (!Number.isFinite(expiresAt)) throw new Error('La licencia no contiene una fecha de vencimiento válida.');
    if (Number.isFinite(notBefore) && now + CLOCK_SKEW_MS < notBefore) throw new Error('La licencia todavía no está vigente.');

    return { ...payload, expiresAtMs: expiresAt };
  }

  detectClockRollback(state, now = Date.now()) {
    const previous = Date.parse(state.lastSeenAt || '');
    return Number.isFinite(previous) && now + CLOCK_SKEW_MS < previous;
  }

  rememberSeen(state, now = Date.now()) {
    const updated = { ...state, lastSeenAt: new Date(now).toISOString() };
    this.writeState(updated);
    return updated;
  }

  activateDemo() {
    const state = this.readState();
    if (state.stateCorrupted) throw new Error('El estado local de licencia está dañado.');

    const registryStarted = readRegistryValue('DemoStartedAt');
    const existingStarted = state.demoStartedAt || registryStarted;
    const demoStartedAt = existingStarted || nowIso();

    if (!registryStarted) writeRegistryValue('DemoStartedAt', demoStartedAt);
    const updated = this.rememberSeen({ ...state, demoStartedAt, commercialToken: state.commercialToken || null });
    writeRegistryValue('DemoLastSeenAt', updated.lastSeenAt);
    return this.getStatus();
  }

  activateCommercial(token) {
    const payload = this.verifyCommercialToken(token);
    const now = Date.now();
    if (payload.expiresAtMs <= now) throw new Error('La licencia ya está vencida.');

    const state = this.readState();
    const updated = {
      ...state,
      commercialToken: String(token).trim(),
      commercialActivatedAt: nowIso(),
      lastSeenAt: nowIso()
    };
    this.writeState(updated);
    return this.getStatus();
  }

  getStatus() {
    const now = Date.now();
    const state = this.readState();
    const registryDemoStart = readRegistryValue('DemoStartedAt');
    const registryLastSeen = readRegistryValue('DemoLastSeenAt');

    if (state.stateCorrupted) {
      return {
        status: 'blocked',
        reason: 'STATE_CORRUPTED',
        installationId: this.installationId,
        message: 'El estado local de licencia está dañado.'
      };
    }

    const effectiveLastSeen = [state.lastSeenAt, registryLastSeen]
      .map(value => Date.parse(value || ''))
      .filter(Number.isFinite)
      .sort((a, b) => b - a)[0];

    if (Number.isFinite(effectiveLastSeen) && now + CLOCK_SKEW_MS < effectiveLastSeen) {
      return {
        status: 'blocked',
        reason: 'CLOCK_ROLLBACK',
        installationId: this.installationId,
        message: 'Se detectó un retroceso importante en la fecha u hora de Windows.'
      };
    }

    if (state.commercialToken) {
      try {
        const payload = this.verifyCommercialToken(state.commercialToken);
        if (payload.expiresAtMs <= now) {
          return {
            status: 'expired',
            mode: 'commercial',
            plan: payload.plan,
            expiresAt: payload.expiresAt,
            installationId: this.installationId,
            message: 'La licencia comercial está vencida.'
          };
        }
        this.rememberSeen(state, now);
        return {
          status: 'active',
          mode: 'commercial',
          plan: payload.plan,
          licenseId: payload.licenseId,
          customer: payload.customer || '',
          expiresAt: payload.expiresAt,
          installationId: this.installationId
        };
      } catch (error) {
        return {
          status: 'blocked',
          reason: 'INVALID_COMMERCIAL_LICENSE',
          installationId: this.installationId,
          message: error.message
        };
      }
    }

    const demoStartedAt = state.demoStartedAt || registryDemoStart;
    if (!demoStartedAt) {
      return {
        status: 'demo_available',
        mode: 'demo',
        demoDays: DEMO_DAYS,
        installationId: this.installationId
      };
    }

    const startMs = Date.parse(demoStartedAt);
    if (!Number.isFinite(startMs)) {
      return {
        status: 'blocked',
        reason: 'INVALID_DEMO_STATE',
        installationId: this.installationId,
        message: 'No fue posible validar el inicio de la demo.'
      };
    }

    const expiresAtMs = startMs + DEMO_DAYS * 24 * 60 * 60 * 1000;
    if (now >= expiresAtMs) {
      return {
        status: 'expired',
        mode: 'demo',
        demoStartedAt,
        expiresAt: new Date(expiresAtMs).toISOString(),
        installationId: this.installationId,
        message: 'La demo de 7 días finalizó.'
      };
    }

    const updated = this.rememberSeen({ ...state, demoStartedAt }, now);
    writeRegistryValue('DemoLastSeenAt', updated.lastSeenAt);
    return {
      status: 'active',
      mode: 'demo',
      demoStartedAt,
      expiresAt: new Date(expiresAtMs).toISOString(),
      remainingMs: expiresAtMs - now,
      installationId: this.installationId
    };
  }
}

module.exports = {
  LicenseManager,
  PRODUCT_ID,
  TOKEN_PREFIX,
  DEMO_DAYS
};
