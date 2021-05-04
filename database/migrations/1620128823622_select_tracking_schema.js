'use strict'

/** @type {import('@adonisjs/lucid/src/Schema')} */
const Schema = use('Schema')

class SelectTramiteSchema extends Schema {
  up () {
    this.table('trackings', (table) => {
      // alter table
      table.boolean('archived').defaultTo(false);
    })
  }

  down () {
    this.table('trackings', (table) => {
      // reverse alternations
      table.dropColumn('archived');
    })
  }
}

module.exports = SelectTramiteSchema
