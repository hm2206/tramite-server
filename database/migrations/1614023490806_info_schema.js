'use strict'

/** @type {import('@adonisjs/lucid/src/Schema')} */
const Schema = use('Schema')

class InfoSchema extends Schema {
  up () {
    this.create('infos', (table) => {
      table.increments()
      table.string('description');
      table.timestamps()
    })
  }

  down () {
    this.drop('infos')
  }
}

module.exports = InfoSchema
