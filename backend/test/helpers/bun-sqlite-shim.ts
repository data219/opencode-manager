import { DatabaseSync } from 'node:sqlite'

export class Database extends DatabaseSync {
  constructor(path: string) {
    super(path)
  }

  run(sql: string, ...params: unknown[]): void {
    if (params.length === 0) {
      this.exec(sql)
      return
    }
    const stmt = this.prepare(sql)
    stmt.run(...(params as never[]))
  }

  query(sql: string): ReturnType<DatabaseSync['prepare']> {
    return this.prepare(sql)
  }
}

export default { Database }
