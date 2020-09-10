'use strict'

/** @type {import('@adonisjs/lucid/src/Schema')} */
const Schema = use('Schema')

class ConfigSchema extends Schema {
  up () {
    this.create('configs', (table) => {
      table.increments()
      table.string('key').notNullable().unique();
      table.string('value').notNullable();
      table.enum('variable', ['NEXT', 'RESTRICTION', 'DAY_LIMIT']).notNullable();
      table.timestamps()
    })
  }

  down () {
    this.drop('configs')
  }
}

module.exports = ConfigSchema
