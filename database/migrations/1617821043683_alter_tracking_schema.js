'use strict'

/** @type {import('@adonisjs/lucid/src/Schema')} */
const Schema = use('Schema')

class AlterTrackingSchema extends Schema {
  up () {
    this.table('trackings', (table) => {
      table.text('description');
    })
  }

  down () {
    this.table('trackings', (table) => {
      table.dropColumn('description');
    })
  }
}

module.exports = AlterTrackingSchema
