import { MigrationInterface, QueryRunner } from 'typeorm';

// BE-07: sal por establecimiento para el hash del dispositivo (docs/06,
// tabla venues). gen_random_bytes es volatil, asi que los locales que ya
// existan reciben cada uno una sal distinta al anadir la columna.
export class AddVenueDeviceHashSalt1793597126203 implements MigrationInterface {
  name = 'AddVenueDeviceHashSalt1793597126203';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "tunio"."venues" ADD "device_hash_salt" bytea NOT NULL DEFAULT gen_random_bytes(32)`,
    );
    await queryRunner.query(
      `ALTER TABLE "tunio"."venues" ADD CONSTRAINT "venues_device_hash_salt_check" CHECK (octet_length(device_hash_salt) = 32)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "tunio"."venues" DROP CONSTRAINT "venues_device_hash_salt_check"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tunio"."venues" DROP COLUMN "device_hash_salt"`,
    );
  }
}
