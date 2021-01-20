'use strict'

/** @type {import('@adonisjs/lucid/src/Schema')} */
const Schema = use('Schema')

class FileSchema extends Schema {
  up () {
    this.create('files', (table) => {
      table.increments()
      table.string('name').notNullable()
      table.integer('object_id').notNullable()
      table.string('object_type').notNullable()
      table.string('extname').notNullable()
      table.string('size').notNullable();
      table.string('url').notNullable()
      table.string('real_path').notNullable()
      table.string('tag');
      table.string('observation');
      table.timestamps()
    })
  }

  down () {
    this.drop('files')
  }
}

module.exports = FileSchema
