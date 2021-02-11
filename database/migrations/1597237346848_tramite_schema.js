'use strict'

/** @type {import('@adonisjs/lucid/src/Schema')} */
const Schema = use('Schema')

class TramiteSchema extends Schema {
  up () {
    this.create('tramites', (table) => {
      table.increments()
      table.string('entity_id').notNullable();
      table.integer('person_id').notNullable();
      table.string('slug');
      table.string('document_number').notNullable();
      table.integer('tramite_type_id').notNullable();
      table.integer('folio_count').notNullable();
      table.string('asunto').notNullable();
      table.text('observation');
      table.integer('dependencia_origen_id');
      table.integer('tramite_parent_id');
      table.integer('user_id');
      table.boolean('state').defaultTo(true);
      table.timestamps()
    })
  }

  down () {
    this.drop('tramites')
  }
}

module.exports = TramiteSchema
