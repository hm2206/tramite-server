'use strict'

/** @type {import('@adonisjs/lucid/src/Schema')} */
const Schema = use('Schema')

class VerifySchema extends Schema {
  up () {
    this.create('verifies', (table) => {
      table.increments()
      table.integer('tracking_id').notNullable();
      table.integer('user_id').notNullable();
      table.datetime('date_verify');
      table.boolean('state').defaultTo(true);
      table.timestamps()
    })
  }

  down () {
    this.drop('verifies')
  }
}

module.exports = VerifySchema
