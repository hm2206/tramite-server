'use strict'

/** @type {import('@adonisjs/lucid/src/Schema')} */
const Schema = use('Schema')

class ConfigDependenciaSchema extends Schema {
  up () {
    this.create('config_dependencias', (table) => {
      table.increments()
      table.integer('entity_id').notNullable();
      table.integer('dependencia_id').notNullable();
      table.integer('dependencia_destino_id').notNullable();
      table.timestamps()
    })
  }

  down () {
    this.drop('config_dependencias')
  }
}

module.exports = ConfigDependenciaSchema
