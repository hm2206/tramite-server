'use strict'

/** @type {import('@adonisjs/lucid/src/Schema')} */
const Schema = use('Schema')

class AddSlugExternoSchema extends Schema {
  up () {
    this.table('dependencia_exteriors', (table) => {
      table.string('code');
    })
  }

  down () {
    this.table('dependencia_exteriors', (table) => {
      table.dropColumn('code');
    })
  }
}

module.exports = AddSlugExternoSchema
