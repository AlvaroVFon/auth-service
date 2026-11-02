import {
  KeyObject,
  createHash,
  createPrivateKey,
  createPublicKey,
} from 'node:crypto';

import { InvalidArgumentError } from '../../common/exceptions/base.exception';

const MIN_RSA_MODULUS_LENGTH = 2048;

export interface JwtKeyMaterial {
  privateKey?: string | KeyObject;
  publicKey?: string | KeyObject;
  kid?: string;
  active?: boolean;
}

export interface JwkPublicKey {
  kty: string;
  use: 'sig';
  alg: 'RS256';
  kid: string;
  n: string;
  e: string;
}

export interface SigningKey {
  kid: string;
  privateKey: KeyObject;
}

interface RegisteredKey {
  kid: string;
  publicKey: KeyObject;
  privateKey?: KeyObject;
}

export class JwtKeyring {
  private readonly keys: readonly RegisteredKey[];
  private readonly activeKey: RegisteredKey;

  constructor(materials: JwtKeyMaterial[]) {
    if (materials.length === 0) {
      throw new InvalidArgumentError(
        'At least one JWT key pair must be configured',
      );
    }

    this.keys = materials.map((material) => this.register(material));
    this.assertUniqueKids();
    this.activeKey = this.resolveActiveKey(materials);
  }

  getSigningKey(): SigningKey {
    if (!this.activeKey.privateKey) {
      throw new InvalidArgumentError('The active JWT key has no private key');
    }

    return { kid: this.activeKey.kid, privateKey: this.activeKey.privateKey };
  }

  getPublicKey(kid: string): KeyObject | undefined {
    return this.keys.find((key) => key.kid === kid)?.publicKey;
  }

  getJwks(): JwkPublicKey[] {
    return this.keys.map(({ kid, publicKey }) => {
      const jwk = publicKey.export({ format: 'jwk' });

      if (jwk.kty !== 'RSA' || !jwk.n || !jwk.e) {
        throw new InvalidArgumentError('Only RSA public keys can be published');
      }

      return {
        kty: jwk.kty,
        use: 'sig',
        alg: 'RS256',
        kid,
        n: jwk.n,
        e: jwk.e,
      };
    });
  }

  private register(material: JwtKeyMaterial): RegisteredKey {
    const privateKey = material.privateKey
      ? this.toPrivateKey(material.privateKey)
      : undefined;
    const publicKey = material.publicKey
      ? this.toPublicKey(material.publicKey)
      : privateKey
        ? createPublicKey(privateKey)
        : undefined;

    if (!publicKey) {
      throw new InvalidArgumentError(
        'Every JWT key must provide a public or a private key',
      );
    }

    this.assertRsaKey(publicKey);

    if (privateKey && !this.isMatchingPair(privateKey, publicKey)) {
      throw new InvalidArgumentError(
        'The JWT private key does not match the public key',
      );
    }

    const kid = material.kid?.trim() || computeJwkThumbprint(publicKey);

    return privateKey ? { kid, publicKey, privateKey } : { kid, publicKey };
  }

  private toPrivateKey(key: string | KeyObject): KeyObject {
    return typeof key === 'string' ? createPrivateKey(key) : key;
  }

  private toPublicKey(key: string | KeyObject): KeyObject {
    return typeof key === 'string' ? createPublicKey(key) : key;
  }

  private assertRsaKey(publicKey: KeyObject): void {
    if (publicKey.asymmetricKeyType !== 'rsa') {
      throw new InvalidArgumentError('JWT keys must be RSA keys');
    }

    const modulusLength = publicKey.asymmetricKeyDetails?.modulusLength ?? 0;

    if (modulusLength < MIN_RSA_MODULUS_LENGTH) {
      throw new InvalidArgumentError(
        `JWT RSA keys must be at least ${MIN_RSA_MODULUS_LENGTH} bits`,
      );
    }
  }

  private isMatchingPair(privateKey: KeyObject, publicKey: KeyObject): boolean {
    const derived = createPublicKey(privateKey).export({ format: 'jwk' });
    const expected = publicKey.export({ format: 'jwk' });

    return derived.n === expected.n && derived.e === expected.e;
  }

  private assertUniqueKids(): void {
    const seen = new Set<string>();

    for (const { kid } of this.keys) {
      if (seen.has(kid)) {
        throw new InvalidArgumentError(`Duplicated JWT key id: ${kid}`);
      }
      seen.add(kid);
    }
  }

  private resolveActiveKey(materials: JwtKeyMaterial[]): RegisteredKey {
    const activeIndexes = materials
      .map((material, index) => (material.active ? index : -1))
      .filter((index) => index >= 0);

    if (activeIndexes.length > 1) {
      throw new InvalidArgumentError('Only one JWT key can be active');
    }

    const active =
      activeIndexes.length === 1
        ? this.keys[activeIndexes[0] as number]
        : this.keys.find((key) => key.privateKey);

    if (!active?.privateKey) {
      throw new InvalidArgumentError(
        'The active JWT key must provide a private key',
      );
    }

    return active;
  }
}

const computeJwkThumbprint = (publicKey: KeyObject): string => {
  const jwk = publicKey.export({ format: 'jwk' });

  if (jwk.kty !== 'RSA' || !jwk.n || !jwk.e) {
    throw new InvalidArgumentError('Only RSA public keys can be published');
  }

  return createHash('sha256')
    .update(JSON.stringify({ e: jwk.e, kty: jwk.kty, n: jwk.n }))
    .digest('base64url');
};
