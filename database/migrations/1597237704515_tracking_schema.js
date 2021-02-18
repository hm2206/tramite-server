'use strict'

/** @type {import('@adonisjs/lucid/src/Schema')} */
const Schema = use('Schema')

class TrackingSchema extends Schema {
  up () {
    this.create('trackings', (table) => {
      table.increments()
      table.integer('tramite_id').notNullable();
      table.integer('dependencia_id').notNullable();
      table.integer('person_id').notNullable();
      table.integer('user_verify_id').comment('Usuario que realizara la verificación del trámite').notNullable();
      table.integer('user_id').comment('Usuario que realizó la acción');
      table.integer('tracking_id');
      table.boolean('alert').defaultTo(false).comment('Tracking que há sido rechazado');
      table.boolean('revisado').defaultTo(false).comment('Tracking que tiene permiso para salir de la dependencia');
      table.boolean('visible').defaultTo(true);
      table.boolean('current').defaultTo(true).comment('Tracking actual');
      table.boolean('first').defaultTo(false);
      table.enum('modo', ['YO', 'DEPENDENCIA']).defaultTo('YO');
      table.enum('status', ['REGISTRADO', 'PENDIENTE', 'ACEPTADO', 'DERIVADO', 'FINALIZADO', 'RECHAZADO', 'ANULADO', 'RECIBIDO', 'RESPONDIDO', 'COPIA']).defaultTo('PENDIENTE');
      table.string("next");
      table.boolean('state').defaultTo(true);
      table.timestamp('readed_at');
      table.timestamps()
    })
  }

  down () {
    this.drop('trackings')
  }
}

module.exports = TrackingSchema
