'use strict'

/** @type {import('@adonisjs/lucid/src/Schema')} */
const Schema = use('Schema')

class InfoSchema extends Schema {
  up () {
    this.create('infos', (table) => {
      table.increments()
      table.text('description');
      table.timestamps()
    })
  }

  down () {
    this.drop('infos')
  }
}

module.exports = InfoSchema
