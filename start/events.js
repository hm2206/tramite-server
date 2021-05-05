const Event = use('Event');

// tramite
Event.on('tramite::new', 'Tramite.createTramite');
Event.on('tramite::notification', 'Tramite.createNotification');

// tracking
Event.on('tracking::notification', 'Tracking.notification');
Event.on('tracking::verify', 'Tracking.verify');