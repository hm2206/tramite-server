'use strict'

/** @type {import('@adonisjs/lucid/src/Schema')} */
const Schema = use('Schema')

class CodeVerifySchema extends Schema {
  up () {
    this.create('code_verifies', (table) => {
      table.increments()
      table.integer('person_id').notNullable();
      table.string('code').notNullable();
      table.boolean('is_revoked').defaultTo(false);
      table.timestamps()
    })
  }

  down () {
    this.drop('code_verifies')
  }
}

module.exports = CodeVerifySchema
