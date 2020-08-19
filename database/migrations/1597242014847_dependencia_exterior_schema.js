'use strict'

/** @type {import('@adonisjs/lucid/src/Schema')} */
const Schema = use('Schema')

class DependenciaExteriorSchema extends Schema {
  up () {
    this.create('dependencia_exteriors', (table) => {
      table.increments()
      table.integer('entity_id').notNullable();
      table.integer('dependencia_id').notNullable();
      table.timestamps()
    })
  }

  down () {
    this.drop('dependencia_exteriors')
  }
}

module.exports = DependenciaExteriorSchema
