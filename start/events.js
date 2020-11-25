const Event = use('Event');

// tramite
Event.on('tramite::new', 'Tramite.createTramite');
Event.on('tramite::verify', 'Tramite.verify');

// tracking
Event.on('tracking::notification', 'Tracking.notification');