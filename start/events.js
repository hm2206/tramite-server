const Event = use('Event');


Event.on('tramite::new', 'Tramite.createTramite');

Event.on('tracking::notification', 'Tracking.notification');