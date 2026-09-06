/** A client-made id: a record is named before the server has ever seen it, so a retry is free. */
export const newId = () => crypto.randomUUID();
