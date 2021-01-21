'use strict';

const Route = require('../app/Services/route');

// Tramite
Route("post", "TramiteController.store").middleware(['jwt', 'entityId', 'dependenciaId']);

// Tipo de trámite
Route("get", "TramiteTypeController.index");

// Tracking
Route("get", "TrackingController.show");

// Files
Route("get", "FileController.handle", false);
Route("post", "FileController.store").middleware(['jwt', "entityId"]);
Route("get", "FileController.object_type").middleware(['jwt']);
Route("post", "FileController.update").middleware(['jwt']);
Route("post", "FileController.observation").middleware(['jwt']);
Route("post", "FileController.destroy").middleware(['jwt']);

// Verificar
Route("post", "VerifyController.handle").middleware(['jwt', 'entityId', 'dependenciaId']);

// Next
Route("post", "NextController.handle").middleware(['jwt', 'entityId', 'dependenciaId']);

// Linea de Tiempo
Route("get", "TimelineController.handle");

// Auth
Route("get", "Auth/AuthRoleController.handle").middleware(['jwt', 'entityId', 'dependenciaId']);
Route("get", "Auth/AuthTramiteController.show").middleware(['jwt', 'entityId', 'dependenciaId']);
Route("get", "Auth/AuthTrackingController.handle").middleware(['jwt', 'entityId', 'dependenciaId']);
Route("get", "Auth/AuthStatusController.handle").middleware(['jwt', 'entityId', 'dependenciaId']);