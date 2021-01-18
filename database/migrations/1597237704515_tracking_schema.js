'use strict'

/** @type {import('@adonisjs/lucid/src/Schema')} */
const Schema = use('Schema')

class TrackingSchema extends Schema {
  up () {
    this.create('trackings', (table) => {
      table.increments()
      table.string('description');
      table.integer('tramite_id').notNullable();
      table.integer('dependencia_id').notNullable();
      table.integer('dependencia_origen_id').notNullable();
      table.integer('dependencia_destino_id').notNullable();
      table.integer('user_id').comment('Usuario que realizó la acción');
      table.integer('user_verify_id').comment('Usuario que realizara la verificación del trámite').notNullable();
      table.integer('person_id').notNullable('Remitente de la acción');
      table.boolean('current').defaultTo(true).comment('Tracking actual');
      table.boolean('alert').defaultTo(false).comment('Tracking que há sido rechazado');
      table.boolean('revisado').defaultTo(false).comment('Tracking que tiene permiso para salir de la dependencia');
      table.boolean('visible').defaultTo(true);
      table.enum('modo', ['YO', 'DEPENDENCIA']).defaultTo('YO');
      table.enum('status', ['REGISTRADO', 'PENDIENTE', 'ACEPTADO', 'DERIVADO', 'FINALIZADO', 'RECHAZADO', 'ANULADO', 'ENVIADO', 'RESPONDIDO', 'COPIA']).defaultTo('PENDIENTE');
      table.boolean('first').defaultTo(false);
      table.boolean('state').defaultTo(true);
      table.timestamps()
    })
  }

  down () {
    this.drop('trackings')
  }
}

module.exports = TrackingSchema
