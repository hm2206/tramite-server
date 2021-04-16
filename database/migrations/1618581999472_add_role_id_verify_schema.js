'use strict'

/** @type {import('@adonisjs/lucid/src/Schema')} */
const Schema = use('Schema')

class AddRoleIdVerifySchema extends Schema {
  up () {
    this.table('verifies', (table) => {
      table.integer('role_id');
    })
  }

  down () {
    this.table('verifies', (table) => {
      table.dropColumn('role_id');
    })
  }
}

module.exports = AddRoleIdVerifySchema
