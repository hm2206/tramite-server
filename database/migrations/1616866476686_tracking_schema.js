'use strict'

/** @type {import('@adonisjs/lucid/src/Schema')} */
const Schema = use('Schema')

class TrackingSchema extends Schema {
  up () {
    this.table('trackings', (table) => {
      table.boolean('is_action').defaultTo(true);
    })
  }

  down () {
    this.table('trackings', (table) => {
      table.dropColumn('is_action');
    })
  }
}

module.exports = TrackingSchema
