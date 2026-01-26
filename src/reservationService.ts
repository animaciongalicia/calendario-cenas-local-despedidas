import { supabase } from './supabaseClient';

export interface Extra {
  nombre: string;
  precio: number;
}

export interface PaymentRecord {
  fecha: Date;
  concepto: string;
  monto: number;
  metodo: 'EFECTIVO' | 'BIZUM' | 'TRANSFERENCIA' | 'TARJETA';
}

export interface Reservation {
  id: string;
  fecha: Date;
  nombreGrupo: string;
  local: string;
  asistentes: number;
  precioPorPersona: number;
  incluyeNovio: boolean;
  extras: Extra[];
  precioTotal: number;
  reservaPagada: number;
  vieneDeAgencia: boolean;
  nombreAgencia?: string;
  comisionAgencia: number;
  contacto: string;
  notas?: string;
  status: 'RESERVA_PAGADA' | 'COBRADO_COMPLETO' | 'CANCELLED';
  pagos: PaymentRecord[];
  createdAt: Date;
}

const STORAGE_KEY = 'admin_reservations_v5';

// Helper para convertir datos de Supabase a nuestro formato
const parseReservationFromDB = (data: any): Reservation => {
  return {
    id: data.id,
    fecha: new Date(data.fecha),
    nombreGrupo: data.nombreGrupo,
    local: data.local,
    asistentes: data.asistentes,
    precioPorPersona: parseFloat(data.precioPorPersona),
    incluyeNovio: data.incluyeNovio,
    extras: data.extras || [],
    precioTotal: parseFloat(data.precioTotal),
    reservaPagada: parseFloat(data.reservaPagada),
    vieneDeAgencia: data.vieneDeAgencia,
    nombreAgencia: data.nombreAgencia,
    comisionAgencia: parseFloat(data.comisionAgencia),
    contacto: data.contacto,
    notas: data.notas,
    status: data.status,
    pagos: (data.pagos || []).map((p: any) => ({
      ...p,
      fecha: new Date(p.fecha)
    })),
    createdAt: new Date(data.createdAt)
  };
};

// Helper para convertir nuestro formato a formato DB
const parseReservationToDB = (reservation: Reservation): any => {
  return {
    id: reservation.id,
    fecha: reservation.fecha.toISOString(),
    nombreGrupo: reservation.nombreGrupo,
    local: reservation.local,
    asistentes: reservation.asistentes,
    precioPorPersona: reservation.precioPorPersona,
    incluyeNovio: reservation.incluyeNovio,
    extras: reservation.extras,
    precioTotal: reservation.precioTotal,
    reservaPagada: reservation.reservaPagada,
    vieneDeAgencia: reservation.vieneDeAgencia,
    nombreAgencia: reservation.nombreAgencia,
    comisionAgencia: reservation.comisionAgencia,
    contacto: reservation.contacto,
    notas: reservation.notas,
    status: reservation.status,
    pagos: reservation.pagos.map(p => ({
      ...p,
      fecha: p.fecha.toISOString()
    })),
    createdAt: reservation.createdAt.toISOString()
  };
};

// Guardar en localStorage como backup
const saveToLocalStorage = (reservations: Reservation[]) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(reservations));
  } catch (e) {
    console.error('Error saving to localStorage:', e);
  }
};

// Cargar desde localStorage
const loadFromLocalStorage = (): Reservation[] => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const data = JSON.parse(saved);
      return data.map((r: any) => ({
        ...r,
        fecha: new Date(r.fecha),
        createdAt: new Date(r.createdAt),
        pagos: (r.pagos || []).map((p: any) => ({
          ...p,
          fecha: new Date(p.fecha)
        }))
      }));
    }
  } catch (e) {
    console.error('Error loading from localStorage:', e);
  }
  return [];
};

// CRUD Operations
export const reservationService = {
  // Cargar todas las reservaciones
  async loadAll(): Promise<Reservation[]> {
    try {
      const { data, error } = await supabase
        .from('reservations')
        .select('*')
        .order('fecha', { ascending: true });

      if (error) throw error;

      const reservations = (data || []).map(parseReservationFromDB);

      // Guardar en localStorage como backup
      saveToLocalStorage(reservations);

      return reservations;
    } catch (error) {
      console.error('Error loading from Supabase, fallback to localStorage:', error);
      // Si falla Supabase, cargar desde localStorage
      return loadFromLocalStorage();
    }
  },

  // Guardar una nueva reservación
  async save(reservation: Reservation): Promise<void> {
    try {
      const dbData = parseReservationToDB(reservation);

      const { error } = await supabase
        .from('reservations')
        .insert([dbData]);

      if (error) throw error;

      console.log('✅ Reservación guardada en Supabase');
    } catch (error) {
      console.error('❌ Error saving to Supabase:', error);
      // Guardar en localStorage como fallback
      const local = loadFromLocalStorage();
      local.push(reservation);
      saveToLocalStorage(local);
    }
  },

  // Actualizar una reservación existente
  async update(reservation: Reservation): Promise<void> {
    try {
      const dbData = parseReservationToDB(reservation);

      const { error } = await supabase
        .from('reservations')
        .update(dbData)
        .eq('id', reservation.id);

      if (error) throw error;

      console.log('✅ Reservación actualizada en Supabase');
    } catch (error) {
      console.error('❌ Error updating Supabase:', error);
      // Actualizar en localStorage como fallback
      const local = loadFromLocalStorage();
      const index = local.findIndex(r => r.id === reservation.id);
      if (index >= 0) {
        local[index] = reservation;
        saveToLocalStorage(local);
      }
    }
  },

  // Eliminar una reservación
  async delete(id: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('reservations')
        .delete()
        .eq('id', id);

      if (error) throw error;

      console.log('✅ Reservación eliminada de Supabase');
    } catch (error) {
      console.error('❌ Error deleting from Supabase:', error);
      // Eliminar de localStorage como fallback
      const local = loadFromLocalStorage();
      const filtered = local.filter(r => r.id !== id);
      saveToLocalStorage(filtered);
    }
  },

  // Migrar datos de localStorage a Supabase
  async migrateFromLocalStorage(): Promise<{ migrated: number; errors: number }> {
    let migrated = 0;
    let errors = 0;

    try {
      const localData = loadFromLocalStorage();

      if (localData.length === 0) {
        console.log('No hay datos en localStorage para migrar');
        return { migrated: 0, errors: 0 };
      }

      console.log(`🔄 Migrando ${localData.length} reservaciones a Supabase...`);

      // Verificar qué datos ya existen en Supabase
      const { data: existing } = await supabase
        .from('reservations')
        .select('id');

      const existingIds = new Set((existing || []).map((r: any) => r.id));

      // Migrar solo los que no existen
      for (const reservation of localData) {
        if (!existingIds.has(reservation.id)) {
          try {
            await this.save(reservation);
            migrated++;
          } catch (e) {
            console.error(`Error migrando reservación ${reservation.id}:`, e);
            errors++;
          }
        }
      }

      console.log(`✅ Migración completada: ${migrated} reservaciones, ${errors} errores`);
      return { migrated, errors };
    } catch (error) {
      console.error('Error durante la migración:', error);
      return { migrated, errors };
    }
  }
};
