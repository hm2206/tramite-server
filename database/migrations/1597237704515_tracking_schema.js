'use strict'

/** @type {import('@adonisjs/lucid/src/Schema')} */
const Schema = use('Schema')

class TrackingSchema extends Schema {
  up () {
    this.create('trackings', (table) => {
      table.increments()
      table.string('description');
      table.string('file');
      table.string('user_id').notNullable();
      table.string('user_destino_id');
      table.integer('tramite_id').notNullable();
      table.integer('dependencia_origen_id').notNullable();
      table.integer('dependencia_destino_id').notNullable();
      table.boolean('current').defaultTo(true);
      table.boolean('parent').defaultTo(false);
      table.enum('status', ['PENDIENTE', 'CONFORME', 'INCONFORME', 'ACEPTADO', 'DERIVADO', 'FINALIZADO', 'RECHAZADO', 'ANULADO']).defaultTo('PENDIENTE');
      table.boolean('state').defaultTo(true);
      table.timestamps()
    })
  }

  down () {
    this.drop('trackings')
  }
}

module.exports = TrackingSchema
