'use strict'

/** @type {import('@adonisjs/lucid/src/Schema')} */
const Schema = use('Schema')

class TramiteTypeSchema extends Schema {
  up () {
    this.create('tramite_types', (table) => {
      table.increments()
      table.string('short_name').notNullable();
      table.string('description').notNullable();
      table.boolean('state').defaultTo(true);
      table.timestamps()
    })
  }

  down () {
    this.drop('tramite_types')
  }
}

module.exports = TramiteTypeSchema
