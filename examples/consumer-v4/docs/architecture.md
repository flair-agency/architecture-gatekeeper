# Consumer architecture

The API validates each request before storage. The storage service persists
only validated records. The consumer repository owns this architecture and
assigns every new responsibility before implementation.
