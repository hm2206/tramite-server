'use strict'

/** @type {import('@adonisjs/lucid/src/Schema')} */
const Schema = use('Schema')

class TramiteSchema extends Schema {
  up () {
    this.create('tramites', (table) => {
      table.increments()
      table.string('entity_id').notNullable();
      table.integer('person_id').notNullable();
      table.integer('user_id').comment('El user que creó el tramite (si es null, se creó el tramite desde el exterior)');
      table.string('slug').unique()
      table.string('document_number').notNullable();
      table.integer('tramite_type_id').notNullable();
      table.integer('folio_count').notNullable();
      table.text('asunto').notNullable();
      table.string('file').notNullable();
      table.integer('dependencia_id').notNullable();
      table.integer('dependencia_origen_id');
      table.boolean('state').defaultTo(true);
      table.timestamps()
    })
  }

  down () {
    this.drop('tramites')
  }
}

module.exports = TramiteSchema
