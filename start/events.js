const Event = use('Event');

// tramite
Event.on('tramite::new', 'Tramite.createTramite');

// tracking
Event.on('tracking::notification', 'Tracking.notification');
Event.on('tracking::verify', 'Tracking.verify');