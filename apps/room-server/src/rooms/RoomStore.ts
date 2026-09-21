import { mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { EngineState } from '@jogae/engine';

/** Onde o estado das salas sobrevive a um reinício do processo (deploy, crash). */
export interface RoomStore {
  save(code: string, state: EngineState): void;
  remove(code: string): void;
  loadAll(): EngineState[];
}

export class MemoryRoomStore implements RoomStore {
  save() {}
  remove() {}
  loadAll(): EngineState[] {
    return [];
  }
}

/**
 * Um JSON por sala. Suficiente para uma instância com volume (dev, Fly com disco).
 * Quando o servidor ganhar a service role do Supabase (passo 4), dá para trocar por uma tabela.
 */
export class FileRoomStore implements RoomStore {
  constructor(private readonly dir: string) {
    mkdirSync(dir, { recursive: true });
  }

  save(code: string, state: EngineState) {
    // Escreve num temporário e renomeia: um crash no meio não deixa JSON pela metade.
    const tmp = join(this.dir, `.${code}.tmp`);
    writeFileSync(tmp, JSON.stringify(state));
    renameSync(tmp, this.file(code));
  }

  remove(code: string) {
    rmSync(this.file(code), { force: true });
  }

  loadAll(): EngineState[] {
    const states: EngineState[] = [];
    for (const name of readdirSync(this.dir)) {
      if (!/^\d{4}\.json$/.test(name)) continue;
      try {
        states.push(JSON.parse(readFileSync(join(this.dir, name), 'utf8')) as EngineState);
      } catch {
        rmSync(join(this.dir, name), { force: true });
      }
    }
    return states;
  }

  private file(code: string) {
    return join(this.dir, `${code}.json`);
  }
}
