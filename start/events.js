const Event = use('Event');

// tramite
Event.on('tramite::new', 'Tramite.createTramite');
Event.on('tramite::tracking', 'Tramite.tracking');

// tracking
Event.on('tracking::notification', 'Tracking.notification');
Event.on('tracking::verify', 'Tracking.verify');