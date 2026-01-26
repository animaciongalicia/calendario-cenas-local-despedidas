import React, { useState, useEffect } from 'react';
import {
  Calendar,
  Users,
  DollarSign,
  Edit,
  Trash2,
  Plus,
  Send,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Clock,
  Phone,
  MapPin,
  FileText,
  Download,
  Upload,
  Search,
  List,
  CalendarCheck,
  Copy,
  History,
  Building2
} from 'lucide-react';

// Types
type ReservationStatus = 'RESERVA_PAGADA' | 'COBRADO_COMPLETO' | 'CANCELLED';
type PaymentMethod = 'EFECTIVO' | 'BIZUM' | 'TRANSFERENCIA' | 'TARJETA';

interface PaymentRecord {
  fecha: Date;
  concepto: string;
  monto: number;
  metodo: PaymentMethod;
}

interface Extra {
  nombre: string;
  precio: number;
}

interface Reservation {
  id: string;
  fecha: Date;
  nombreGrupo: string;
  local: string;
  asistentes: number;
  precioPorPersona: number; // 50€ por persona
  incluyeNovio: boolean; // Si >= 11, novio no paga
  extras: Extra[]; // Pack copas, etc.
  precioTotal: number; // (50€ * personas que pagan) + sum(extras)
  reservaPagada: number; // Señal pagada (si NO es de agencia)
  vieneDeAgencia: boolean; // Si viene de agencia intermediaria
  nombreAgencia?: string; // Nombre de la agencia
  comisionAgencia: number; // 10€ * personas que pagan (novio gratis si >= 11)
  contacto: string;
  notas?: string;
  status: ReservationStatus;
  pagos: PaymentRecord[]; // Historial
  createdAt: Date;
}

type ViewMode = 'calendar' | 'list' | 'pendientes' | 'resumen';

// Agencias que venden para el local
const AGENCIAS = [
  'Humor Coruña',
  'QuadAventuras',
  'Alex Ruiz',
  'Me Divierto',
  'Mas Gincanas',
  'Aventuras Galicia',
  'Todo Fiesta',
  'Buena Vida',
  'Otra agencia'
];

// Helper functions
const getSaturdaysInRange = (year: number, startMonth: number, endMonth: number): Date[] => {
  const saturdays: Date[] = [];
  for (let month = startMonth; month <= endMonth; month++) {
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      if (date.getDay() === 6) {
        saturdays.push(date);
      }
    }
  }
  return saturdays;
};

const formatDate = (date: Date): string => {
  return date.toLocaleDateString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
};

const formatShortDate = (date: Date): string => {
  return date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
};

const formatCurrency = (amount: number): string => {
  return `${amount.toFixed(2)}€`;
};

const calcularPrecioTotal = (asistentes: number, precioPorPersona: number, incluyeNovio: boolean, extras: Extra[]): number => {
  const personasQuePagan = incluyeNovio ? asistentes : asistentes - 1;
  const totalCena = personasQuePagan * precioPorPersona;
  const totalExtras = extras.reduce((sum, extra) => sum + extra.precio, 0);
  return totalCena + totalExtras;
};

const isSameDay = (date1: Date, date2: Date): boolean => {
  return date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate();
};

const calcularPendienteCobro = (reservation: Reservation): number => {
  if (reservation.vieneDeAgencia) {
    // Si viene de agencia, ellos ya cobraron su comisión
    return reservation.precioTotal - reservation.comisionAgencia;
  } else {
    // Si es directo, restamos la reserva pagada
    return reservation.precioTotal - reservation.reservaPagada;
  }
};

export default function App() {
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth());
  const [viewMode, setViewMode] = useState<ViewMode>('calendar');
  const [searchQuery, setSearchQuery] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingReservation, setEditingReservation] = useState<Reservation | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  // Load from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('admin_reservations_v5');
    if (saved) {
      try {
        const data = JSON.parse(saved);
        const parsed = data.map((r: any) => ({
          ...r,
          fecha: new Date(r.fecha),
          createdAt: new Date(r.createdAt),
          vieneDeAgencia: r.vieneDeAgencia || false,
          comisionAgencia: r.comisionAgencia || 0,
          precioPorPersona: r.precioPorPersona || 50,
          incluyeNovio: r.incluyeNovio !== undefined ? r.incluyeNovio : (r.asistentes < 11),
          extras: r.extras || [],
          pagos: (r.pagos || []).map((p: any) => ({
            ...p,
            fecha: new Date(p.fecha)
          }))
        }));
        setReservations(parsed);
      } catch (e) {
        console.error('Error loading reservations', e);
      }
    } else {
      // Migrar desde v3/v4 si existe
      const savedV4 = localStorage.getItem('admin_reservations_v4') || localStorage.getItem('admin_reservations_v3');
      if (savedV4) {
        try {
          const data = JSON.parse(savedV4);
          const migrated = data.map((r: any) => ({
            ...r,
            fecha: new Date(r.fecha),
            createdAt: new Date(r.createdAt),
            vieneDeAgencia: r.vieneDeAgencia || false,
            precioPorPersona: 50,
            incluyeNovio: r.asistentes < 11,
            extras: [],
            precioTotal: r.asistentes >= 11 ? (r.asistentes - 1) * 50 : r.asistentes * 50,
            comisionAgencia: r.vieneDeAgencia ? (r.asistentes >= 11 ? (r.asistentes - 1) * 10 : r.asistentes * 10) : 0,
            pagos: (r.pagos || []).map((p: any) => ({
              ...p,
              fecha: new Date(p.fecha)
            }))
          }));
          setReservations(migrated);
          console.log('Datos migrados a v5');
        } catch (e) {
          console.error('Error migrando datos', e);
        }
      }
    }
  }, []);

  // Save to localStorage
  useEffect(() => {
    localStorage.setItem('admin_reservations_v5', JSON.stringify(reservations));
  }, [reservations]);

  const getSeasonSaturdays = () => {
    const currentYear = new Date().getFullYear();
    return getSaturdaysInRange(currentYear, 3, 8);
  };

  const getReservationsForDate = (date: Date): Reservation[] => {
    return reservations.filter(r => isSameDay(r.fecha, date));
  };

  const getTodayReservations = (): Reservation[] => {
    const today = new Date();
    return reservations.filter(r => isSameDay(r.fecha, today));
  };

  const filteredReservations = reservations.filter(r => {
    const query = searchQuery.toLowerCase();
    return r.nombreGrupo?.toLowerCase().includes(query) ||
      r.contacto?.includes(query) ||
      r.local?.toLowerCase().includes(query) ||
      (r.notas && r.notas.toLowerCase().includes(query));
  });

  const saveReservation = (reservation: Reservation) => {
    const existingIndex = reservations.findIndex(r => r.id === reservation.id);
    if (existingIndex >= 0) {
      const updated = [...reservations];
      updated[existingIndex] = reservation;
      setReservations(updated);
    } else {
      setReservations([...reservations, reservation]);
    }
  };

  const marcarCobradoCompleto = (reservationId: string) => {
    const reservation = reservations.find(r => r.id === reservationId);
    if (!reservation) return;

    const pendiente = calcularPendienteCobro(reservation);

    const concepto = reservation.vieneDeAgencia
      ? `Cobro día evento (resto tras comisión ${reservation.nombreAgencia})`
      : 'Cobro día del evento';

    const nuevoPago: PaymentRecord = {
      fecha: new Date(),
      concepto,
      monto: pendiente,
      metodo: 'EFECTIVO'
    };

    const updated: Reservation = {
      ...reservation,
      status: 'COBRADO_COMPLETO',
      pagos: [...reservation.pagos, nuevoPago]
    };

    saveReservation(updated);
  };

  const revertirCobro = (reservationId: string) => {
    if (!window.confirm('¿Revertir a estado pendiente? Se eliminará el último registro de cobro.')) {
      return;
    }

    const reservation = reservations.find(r => r.id === reservationId);
    if (!reservation) return;

    // Eliminar el último pago (el que marcó como cobrado)
    const pagosActualizados = reservation.pagos.slice(0, -1);

    const updated: Reservation = {
      ...reservation,
      status: 'RESERVA_PAGADA',
      pagos: pagosActualizados
    };

    saveReservation(updated);
  };

  const deleteReservation = (id: string) => {
    if (window.confirm('¿Seguro que quieres eliminar esta reserva?')) {
      setReservations(reservations.filter(r => r.id !== id));
    }
  };

  const generateWhatsAppMessage = (reservation: Reservation): string => {
    const pendiente = calcularPendienteCobro(reservation);
    const fecha = formatDate(reservation.fecha);

    const personasQuePagan = reservation.incluyeNovio ? reservation.asistentes : reservation.asistentes - 1;

    let msg = `🎉 *RECORDATORIO CENA GRUPO* 🎉\n\n`;
    msg += `👥 *Grupo:* ${reservation.nombreGrupo}\n`;
    msg += `📅 *Fecha:* ${fecha}\n`;
    msg += `🏠 *Local:* ${reservation.local}\n`;
    msg += `👨‍👩‍👧‍👦 *Asistentes:* ${reservation.asistentes} personas\n\n`;
    msg += `------------------\n`;
    msg += `💰 *ESTADO DE PAGO*\n`;
    msg += `Precio cena: ${formatCurrency(reservation.precioPorPersona)} x ${personasQuePagan} persona${personasQuePagan !== 1 ? 's' : ''} = ${formatCurrency(personasQuePagan * reservation.precioPorPersona)}\n`;

    if (!reservation.incluyeNovio) {
      msg += `(Novio/a gratis - 11+ personas)\n`;
    }

    if (reservation.extras && reservation.extras.length > 0) {
      msg += `Extras:\n`;
      reservation.extras.forEach(extra => {
        msg += `  • ${extra.nombre}: ${formatCurrency(extra.precio)}\n`;
      });
    }

    msg += `Total cena: ${formatCurrency(reservation.precioTotal)}\n`;

    if (reservation.vieneDeAgencia) {
      if (reservation.nombreAgencia) {
        msg += `Reserva a través de: ${reservation.nombreAgencia}\n`;
      }
      msg += `Pagado a agencia: ${formatCurrency(reservation.comisionAgencia)}\n`;
    } else {
      msg += `Reserva pagada: ${formatCurrency(reservation.reservaPagada)}\n`;
    }

    if (pendiente > 0) {
      msg += `❗ *A PAGAR EL SÁBADO: ${formatCurrency(pendiente)}* (efectivo)\n\n`;
      msg += `Por favor, traer el importe exacto el día del evento.\n`;
    } else {
      msg += `✅ *PAGADO COMPLETO*\n\n`;
      msg += `¡Todo listo para el sábado!\n`;
    }

    msg += `\n------------------\n`;
    msg += `📞 Cualquier duda, contactar a ${reservation.contacto}\n`;

    if (reservation.notas) {
      msg += `\n📝 *Notas:* ${reservation.notas}`;
    }

    return msg;
  };

  const exportData = () => {
    const dataStr = JSON.stringify(reservations, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `reservas-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
  };

  const importData = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = JSON.parse(e.target?.result as string);
          const parsed = data.map((r: any) => ({
            ...r,
            fecha: new Date(r.fecha),
            createdAt: new Date(r.createdAt),
            pagos: (r.pagos || []).map((p: any) => ({
              ...p,
              fecha: new Date(p.fecha)
            }))
          }));
          setReservations(parsed);
          alert('Datos importados correctamente');
        } catch (err) {
          alert('Error al importar datos');
        }
      };
      reader.readAsText(file);
    }
  };

  // Modal Component
  const ReservationModal = () => {
    const [formData, setFormData] = useState<Partial<Reservation>>(
      editingReservation || {
        nombreGrupo: '',
        local: 'Despedidas',
        asistentes: 0,
        precioPorPersona: 50,
        incluyeNovio: true,
        extras: [],
        precioTotal: 0,
        reservaPagada: 0,
        vieneDeAgencia: false,
        nombreAgencia: '',
        comisionAgencia: 0,
        contacto: '',
        notas: '',
        status: 'RESERVA_PAGADA',
        pagos: []
      }
    );

    const [nuevoExtra, setNuevoExtra] = useState({ nombre: '', precio: 0 });

    useEffect(() => {
      const asistentes = formData.asistentes || 0;
      const precioPorPersona = formData.precioPorPersona || 50;
      const incluyeNovio = asistentes < 11;
      const personasQuePagan = incluyeNovio ? asistentes : asistentes - 1;

      const total = calcularPrecioTotal(asistentes, precioPorPersona, incluyeNovio, formData.extras || []);
      const comision = formData.vieneDeAgencia ? personasQuePagan * 10 : 0;

      setFormData(prev => ({
        ...prev,
        incluyeNovio,
        precioTotal: total,
        comisionAgencia: comision
      }));
    }, [formData.asistentes, formData.precioPorPersona, formData.extras, formData.vieneDeAgencia]);

    const agregarExtra = () => {
      if (nuevoExtra.nombre && nuevoExtra.precio > 0) {
        setFormData(prev => ({
          ...prev,
          extras: [...(prev.extras || []), { ...nuevoExtra }]
        }));
        setNuevoExtra({ nombre: '', precio: 0 });
      }
    };

    const eliminarExtra = (index: number) => {
      setFormData(prev => ({
        ...prev,
        extras: (prev.extras || []).filter((_, i) => i !== index)
      }));
    };

    const handleSave = () => {
      if (!formData.nombreGrupo || !formData.contacto || !formData.asistentes) {
        alert('Por favor, rellena los campos obligatorios');
        return;
      }

      if (formData.vieneDeAgencia && !formData.nombreAgencia) {
        alert('Por favor, selecciona la agencia');
        return;
      }

      const pagos: PaymentRecord[] = editingReservation?.pagos || [];

      // Si hay reserva pagada y es nueva, añadir al historial
      if (formData.reservaPagada && formData.reservaPagada > 0 && !editingReservation) {
        pagos.push({
          fecha: new Date(),
          concepto: 'Reserva inicial',
          monto: formData.reservaPagada,
          metodo: 'BIZUM'
        });
      }

      const reservation: Reservation = {
        id: editingReservation?.id || `res_${Date.now()}`,
        fecha: editingReservation?.fecha || selectedDate || new Date(),
        nombreGrupo: formData.nombreGrupo!,
        local: formData.local || 'Despedidas',
        asistentes: formData.asistentes!,
        precioPorPersona: formData.precioPorPersona || 50,
        incluyeNovio: formData.incluyeNovio !== undefined ? formData.incluyeNovio : true,
        extras: formData.extras || [],
        precioTotal: formData.precioTotal || 0,
        reservaPagada: formData.reservaPagada || 0,
        vieneDeAgencia: formData.vieneDeAgencia || false,
        nombreAgencia: formData.nombreAgencia,
        comisionAgencia: formData.comisionAgencia || 0,
        contacto: formData.contacto!,
        notas: formData.notas,
        status: formData.status || 'RESERVA_PAGADA',
        pagos,
        createdAt: editingReservation?.createdAt || new Date()
      };

      saveReservation(reservation);
      setShowModal(false);
      setEditingReservation(null);
      setSelectedDate(null);
    };

    return (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
          <div className="p-6 border-b border-gray-200 flex justify-between items-center sticky top-0 bg-white z-10">
            <h3 className="text-2xl font-bold text-gray-900">
              {editingReservation ? 'Editar Reserva' : 'Nueva Reserva'}
            </h3>
            <button
              onClick={() => {
                setShowModal(false);
                setEditingReservation(null);
                setSelectedDate(null);
              }}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <XCircle className="w-6 h-6" />
            </button>
          </div>

          <div className="p-6 space-y-4">
            {selectedDate && !editingReservation && (
              <div className="bg-blue-50 p-3 rounded-lg text-blue-900 font-medium">
                📅 {formatDate(selectedDate)}
              </div>
            )}

            {/* Calculadora automática */}
            <div className="bg-gradient-to-r from-purple-50 to-blue-50 p-4 rounded-xl border-2 border-purple-200">
              <h4 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-purple-600" />
                Calculadora Automática
              </h4>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-gray-600">Asistentes:</span>
                  <span className="ml-2 font-bold text-gray-900">{formData.asistentes || 0}</span>
                </div>
                <div>
                  <span className="text-gray-600">Precio/persona:</span>
                  <span className="ml-2 font-bold text-gray-900">{formatCurrency(formData.precioPorPersona || 50)}</span>
                </div>
                <div>
                  <span className="text-gray-600">Pagan:</span>
                  <span className="ml-2 font-bold text-gray-900">
                    {formData.incluyeNovio ? formData.asistentes || 0 : Math.max(0, (formData.asistentes || 0) - 1)} personas
                  </span>
                </div>
                <div>
                  <span className="text-gray-600">Cena:</span>
                  <span className="ml-2 font-bold text-gray-900">
                    {formatCurrency((formData.incluyeNovio ? (formData.asistentes || 0) : Math.max(0, (formData.asistentes || 0) - 1)) * (formData.precioPorPersona || 50))}
                  </span>
                </div>
                <div>
                  <span className="text-gray-600">Extras:</span>
                  <span className="ml-2 font-bold text-gray-900">{formatCurrency((formData.extras || []).reduce((sum, e) => sum + e.precio, 0))}</span>
                </div>
                <div>
                  <span className="text-gray-600">Total:</span>
                  <span className="ml-2 font-bold text-purple-700 text-lg">{formatCurrency(formData.precioTotal || 0)}</span>
                </div>
              </div>
              {(formData.asistentes || 0) >= 11 && (
                <div className="mt-2 text-sm bg-green-100 text-green-800 p-2 rounded">
                  🎉 11+ personas: El novio/a NO paga
                </div>
              )}
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">
                  Nombre del Grupo *
                </label>
                <input
                  type="text"
                  className="w-full p-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Ej: Grupo Ana"
                  value={formData.nombreGrupo}
                  onChange={(e) => setFormData({ ...formData, nombreGrupo: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">
                  Local
                </label>
                <input
                  type="text"
                  className="w-full p-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  value={formData.local}
                  onChange={(e) => setFormData({ ...formData, local: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">
                  Asistentes *
                </label>
                <input
                  type="number"
                  min="1"
                  className="w-full p-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  value={formData.asistentes || ''}
                  onChange={(e) => setFormData({ ...formData, asistentes: parseInt(e.target.value) || 0 })}
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">
                  Precio por Persona
                </label>
                <div className="w-full p-3 border-2 border-gray-300 rounded-lg bg-gray-100 font-bold text-gray-700">
                  {formatCurrency(formData.precioPorPersona || 50)} / persona
                </div>
                <p className="text-xs text-gray-600 mt-1">Precio fijo por persona (50€)</p>
              </div>

              {/* Sección de Extras */}
              <div className="md:col-span-2">
                <label className="block text-sm font-bold text-gray-700 mb-2">
                  Extras Opcionales (pack copas, etc.)
                </label>
                <div className="border-2 border-gray-300 rounded-lg p-4 space-y-3">
                  {/* Lista de extras */}
                  {(formData.extras || []).length > 0 && (
                    <div className="space-y-2 mb-3">
                      {formData.extras!.map((extra, index) => (
                        <div key={index} className="flex items-center justify-between bg-gray-50 p-2 rounded">
                          <div>
                            <span className="font-medium text-gray-900">{extra.nombre}</span>
                            <span className="ml-2 text-gray-600">{formatCurrency(extra.precio)}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => eliminarExtra(index)}
                            className="text-red-600 hover:text-red-700 p-1"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Agregar nuevo extra */}
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Nombre (ej: Pack copas)"
                      className="flex-1 p-2 border border-gray-300 rounded"
                      value={nuevoExtra.nombre}
                      onChange={(e) => setNuevoExtra({ ...nuevoExtra, nombre: e.target.value })}
                    />
                    <input
                      type="number"
                      placeholder="Precio"
                      className="w-24 p-2 border border-gray-300 rounded"
                      value={nuevoExtra.precio || ''}
                      onChange={(e) => setNuevoExtra({ ...nuevoExtra, precio: parseFloat(e.target.value) || 0 })}
                    />
                    <button
                      type="button"
                      onClick={agregarExtra}
                      className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center gap-1"
                    >
                      <Plus className="w-4 h-4" />
                      Añadir
                    </button>
                  </div>
                </div>
              </div>

              {/* Checkbox Viene de Agencia */}
              <div className="md:col-span-2">
                <label className="flex items-center gap-3 p-3 border-2 border-gray-300 rounded-lg hover:bg-gray-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.vieneDeAgencia || false}
                    onChange={(e) => setFormData({ ...formData, vieneDeAgencia: e.target.checked })}
                    className="w-5 h-5 text-blue-600"
                  />
                  <div className="flex-1">
                    <span className="font-bold text-gray-900 flex items-center gap-2">
                      <Building2 className="w-5 h-5 text-blue-600" />
                      ¿Viene de agencia intermediaria?
                    </span>
                    <p className="text-xs text-gray-600 mt-1">
                      La agencia cobra 10€/persona y el grupo paga el resto aquí
                    </p>
                  </div>
                </label>
              </div>

              {/* Selector de Agencia (solo si viene de agencia) */}
              {formData.vieneDeAgencia && (
                <>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">
                      Nombre de la Agencia *
                    </label>
                    <select
                      className="w-full p-3 border-2 border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-blue-50"
                      value={formData.nombreAgencia}
                      onChange={(e) => setFormData({ ...formData, nombreAgencia: e.target.value })}
                    >
                      <option value="">Selecciona agencia...</option>
                      {AGENCIAS.map(agencia => (
                        <option key={agencia} value={agencia}>{agencia}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">
                      Comisión Agencia (automático)
                    </label>
                    <div className="w-full p-3 border-2 border-blue-300 rounded-lg bg-blue-50 font-bold text-blue-900">
                      {formatCurrency(formData.comisionAgencia || 0)}
                    </div>
                    <p className="text-xs text-blue-600 mt-1">
                      10€ × {formData.incluyeNovio ? (formData.asistentes || 0) : Math.max(0, (formData.asistentes || 0) - 1)} persona{((formData.incluyeNovio ? (formData.asistentes || 0) : Math.max(0, (formData.asistentes || 0) - 1)) !== 1) ? 's' : ''} que pagan = ya cobrado por agencia
                    </p>
                  </div>
                </>
              )}

              {/* Reserva Pagada (solo si NO viene de agencia) */}
              {!formData.vieneDeAgencia && (
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">
                    Reserva Pagada (señal)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="w-full p-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    value={formData.reservaPagada || ''}
                    onChange={(e) => setFormData({ ...formData, reservaPagada: parseFloat(e.target.value) || 0 })}
                  />
                </div>
              )}

              {/* A cobrar el sábado */}
              <div className={!formData.vieneDeAgencia ? '' : 'md:col-span-2'}>
                <label className="block text-sm font-bold text-gray-700 mb-2">
                  A Cobrar el Sábado
                </label>
                <div className="w-full p-3 border-2 border-orange-300 rounded-lg bg-orange-50 font-bold text-orange-900 text-lg">
                  {formatCurrency(
                    formData.vieneDeAgencia
                      ? (formData.precioTotal || 0) - (formData.comisionAgencia || 0)
                      : (formData.precioTotal || 0) - (formData.reservaPagada || 0)
                  )}
                </div>
                <p className="text-xs text-orange-600 mt-1">
                  {formData.vieneDeAgencia
                    ? 'Total - Comisión agencia = A cobrar en efectivo'
                    : 'Total - Reserva pagada = A cobrar en efectivo'}
                </p>
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">
                  Contacto (WhatsApp) *
                </label>
                <input
                  type="tel"
                  className="w-full p-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="678288284"
                  value={formData.contacto}
                  onChange={(e) => setFormData({ ...formData, contacto: e.target.value })}
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-bold text-gray-700 mb-2">
                  Notas
                </label>
                <textarea
                  className="w-full p-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  rows={3}
                  placeholder="Alergias, peticiones especiales, etc."
                  value={formData.notas || ''}
                  onChange={(e) => setFormData({ ...formData, notas: e.target.value })}
                />
              </div>
            </div>

            {/* Historial de pagos (si existe) */}
            {editingReservation && editingReservation.pagos.length > 0 && (
              <div className="bg-gray-50 p-4 rounded-lg">
                <h4 className="font-bold text-gray-900 mb-2 flex items-center gap-2">
                  <History className="w-5 h-5" />
                  Historial de Pagos
                </h4>
                <div className="space-y-2">
                  {editingReservation.pagos.map((pago, idx) => (
                    <div key={idx} className="flex justify-between items-center text-sm">
                      <div>
                        <span className="text-gray-600">{formatShortDate(pago.fecha)}</span>
                        <span className="mx-2">-</span>
                        <span className="font-medium">{pago.concepto}</span>
                        <span className="ml-2 text-gray-500">({pago.metodo})</span>
                      </div>
                      <span className="font-bold text-green-600">{formatCurrency(pago.monto)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-4 border-t">
              <button
                onClick={() => {
                  setShowModal(false);
                  setEditingReservation(null);
                  setSelectedDate(null);
                }}
                className="px-6 py-3 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors font-medium"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-bold"
              >
                {editingReservation ? 'Guardar Cambios' : 'Crear Reserva'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const saturdays = getSeasonSaturdays();
  const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const availableMonths = [3, 4, 5, 6, 7, 8];
  const filteredSaturdays = saturdays.filter(d => d.getMonth() === selectedMonth);

  const stats = {
    total: reservations.length,
    reservasPagadas: reservations.filter(r => r.status === 'RESERVA_PAGADA').length,
    cobradas: reservations.filter(r => r.status === 'COBRADO_COMPLETO').length,
    totalReservas: reservations.reduce((sum, r) => {
      // Para agencias, contamos la comisión SOLO si NO es "Otra agencia"
      // Porque "Otra agencia" no nos da el dinero a nosotros
      if (r.vieneDeAgencia) {
        return r.nombreAgencia === 'Otra agencia' ? sum : sum + r.comisionAgencia;
      }
      // Para directos, la reserva pagada
      return sum + r.reservaPagada;
    }, 0),
    totalCobrado: reservations.filter(r => r.status === 'COBRADO_COMPLETO').reduce((sum, r) => {
      // Solo sumamos lo que realmente cobramos nosotros
      // Si es "Otra agencia", sumamos el total menos su comisión
      if (r.vieneDeAgencia && r.nombreAgencia === 'Otra agencia') {
        return sum + (r.precioTotal - r.comisionAgencia);
      }
      return sum + r.precioTotal;
    }, 0),
    pendienteCobrar: reservations.filter(r => r.status === 'RESERVA_PAGADA').reduce((sum, r) => sum + calcularPendienteCobro(r), 0)
  };

  // Render Views
  const renderCalendarView = () => (
    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
      {filteredSaturdays.map(saturday => {
        const dayReservations = getReservationsForDate(saturday);
        const hasReservations = dayReservations.length > 0;

        return (
          <div
            key={saturday.toISOString()}
            className={`bg-white rounded-2xl shadow-md border-2 transition-all hover:shadow-lg ${
              hasReservations ? 'border-blue-300' : 'border-gray-200'
            }`}
          >
            <div className="p-4">
              <div className="flex items-center justify-between pb-3 border-b-2 border-gray-200 mb-3">
                <div>
                  <p className="text-3xl font-bold text-gray-900">{saturday.getDate()}</p>
                  <p className="text-xs text-gray-600 uppercase font-medium">
                    {saturday.toLocaleDateString('es-ES', { weekday: 'long', month: 'short' })}
                  </p>
                </div>
                <button
                  onClick={() => {
                    setSelectedDate(saturday);
                    setShowModal(true);
                  }}
                  className="text-blue-600 hover:text-blue-700 p-2 rounded-lg hover:bg-blue-50 transition-colors"
                  title="Añadir grupo"
                >
                  <Plus className="w-5 h-5" />
                </button>
              </div>

              {hasReservations ? (
                <div className="space-y-2">
                  <div className="text-xs text-gray-600 font-medium mb-2">
                    {dayReservations.length} grupo{dayReservations.length !== 1 ? 's' : ''}
                  </div>
                  {dayReservations.map(reservation => (
                    <div
                      key={reservation.id}
                      className={`border-l-4 ${
                        reservation.status === 'COBRADO_COMPLETO'
                          ? 'border-green-500 bg-green-50'
                          : 'border-yellow-500 bg-yellow-50'
                      } p-3 rounded-r hover:shadow transition-shadow cursor-pointer`}
                      onClick={() => {
                        setEditingReservation(reservation);
                        setShowModal(true);
                      }}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-sm text-gray-900 truncate flex items-center gap-1">
                            {reservation.nombreGrupo}
                            {reservation.vieneDeAgencia && (
                              <Building2 className="w-3 h-3 text-blue-600 flex-shrink-0" title={reservation.nombreAgencia} />
                            )}
                          </p>
                          <div className="flex items-center gap-3 mt-1 text-xs text-gray-600">
                            <span className="flex items-center gap-1">
                              <Users className="w-3 h-3" />
                              {reservation.asistentes}
                            </span>
                            <span className="flex items-center gap-1">
                              <Phone className="w-3 h-3" />
                              {reservation.contacto}
                            </span>
                          </div>
                        </div>
                        <div className="flex gap-1 ml-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingReservation(reservation);
                              setShowModal(true);
                            }}
                            className="text-gray-400 hover:text-blue-600 p-1 rounded"
                          >
                            <Edit className="w-3 h-3" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteReservation(reservation.id);
                            }}
                            className="text-gray-400 hover:text-red-600 p-1 rounded"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-400">
                  <Calendar className="w-12 h-12 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Sin reserva</p>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );

  const renderListView = () => (
    <div className="bg-white rounded-xl shadow-md overflow-hidden">
      <table className="w-full">
        <thead className="bg-gray-50 border-b-2 border-gray-200">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase">Fecha</th>
            <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase">Grupo</th>
            <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase">Personas</th>
            <th className="px-4 py-3 text-right text-xs font-bold text-gray-700 uppercase">Total</th>
            <th className="px-4 py-3 text-right text-xs font-bold text-gray-700 uppercase">Pagado</th>
            <th className="px-4 py-3 text-right text-xs font-bold text-gray-700 uppercase">A Cobrar</th>
            <th className="px-4 py-3 text-center text-xs font-bold text-gray-700 uppercase">Estado</th>
            <th className="px-4 py-3 text-right text-xs font-bold text-gray-700 uppercase">Acciones</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {filteredReservations
            .sort((a, b) => a.fecha.getTime() - b.fecha.getTime())
            .map(reservation => {
              const pendiente = calcularPendienteCobro(reservation);
              const pagado = reservation.vieneDeAgencia ? reservation.comisionAgencia : reservation.reservaPagada;
              return (
                <tr key={reservation.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">
                    {formatShortDate(reservation.fecha)}
                  </td>
                  <td className="px-4 py-3">
                    <div>
                      <p className="text-sm font-bold text-gray-900 flex items-center gap-1">
                        {reservation.nombreGrupo}
                        {reservation.vieneDeAgencia && (
                          <Building2 className="w-3 h-3 text-blue-600" title={reservation.nombreAgencia} />
                        )}
                      </p>
                      <p className="text-xs text-gray-500">{reservation.local}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">{reservation.asistentes}</td>
                  <td className="px-4 py-3 text-sm font-bold text-gray-900 text-right">
                    {formatCurrency(reservation.precioTotal)}
                  </td>
                  <td className="px-4 py-3 text-sm text-right">
                    <div className={reservation.vieneDeAgencia ? "text-blue-600" : "text-green-600"}>
                      {formatCurrency(pagado)}
                    </div>
                    <div className="text-xs text-gray-500">
                      {reservation.vieneDeAgencia ? "Agencia" : "Reserva"}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm font-bold text-orange-600 text-right">
                    {formatCurrency(pendiente)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {reservation.status === 'COBRADO_COMPLETO' ? (
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-800 text-xs font-bold rounded">
                        <CheckCircle2 className="w-3 h-3" />
                        Cobrado
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-yellow-100 text-yellow-800 text-xs font-bold rounded">
                        <AlertCircle className="w-3 h-3" />
                        Pendiente
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1">
                      <button
                        onClick={() => {
                          setEditingReservation(reservation);
                          setShowModal(true);
                        }}
                        className="p-1.5 text-gray-400 hover:text-blue-600 rounded hover:bg-blue-50"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => {
                          const msg = generateWhatsAppMessage(reservation);
                          const url = `https://wa.me/${reservation.contacto.replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`;
                          window.open(url, '_blank');
                        }}
                        className="p-1.5 text-gray-400 hover:text-green-600 rounded hover:bg-green-50"
                      >
                        <Send className="w-4 h-4" />
                      </button>
                      {reservation.status === 'RESERVA_PAGADA' ? (
                        <button
                          onClick={() => marcarCobradoCompleto(reservation.id)}
                          className="p-1.5 text-gray-400 hover:text-blue-600 rounded hover:bg-blue-50"
                          title="Marcar como cobrado"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                        </button>
                      ) : (
                        <button
                          onClick={() => revertirCobro(reservation.id)}
                          className="p-1.5 text-gray-400 hover:text-orange-600 rounded hover:bg-orange-50"
                          title="Revertir a pendiente"
                        >
                          <XCircle className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
        </tbody>
      </table>
      {filteredReservations.length === 0 && (
        <div className="text-center py-12 text-gray-400">
          No hay reservas que coincidan con tu búsqueda
        </div>
      )}
    </div>
  );

  const renderPendientesView = () => {
    const today = new Date();
    const pendientes = reservations
      .filter(r => r.status === 'RESERVA_PAGADA')
      .sort((a, b) => a.fecha.getTime() - b.fecha.getTime());

    return (
      <div className="max-w-3xl mx-auto space-y-4">
        <div className="bg-gradient-to-r from-orange-500 to-red-600 text-white p-6 rounded-xl shadow-lg">
          <h2 className="text-2xl font-bold mb-2">Pendientes de Cobro</h2>
          <p className="text-orange-100">
            {pendientes.length > 0
              ? `Tienes ${pendientes.length} grupo(s) pendientes de cobro`
              : 'No hay grupos pendientes de cobro'}
          </p>
        </div>

        {pendientes.length > 0 ? (
          pendientes.map(reservation => {
            const pendiente = calcularPendienteCobro(reservation);
            const isToday = isSameDay(reservation.fecha, today);
            return (
              <div
                key={reservation.id}
                className={`bg-white p-6 rounded-xl shadow-md border-4 ${
                  isToday
                    ? 'border-orange-400 bg-orange-50'
                    : 'border-gray-200'
                }`}
              >
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                        {reservation.nombreGrupo}
                        {reservation.vieneDeAgencia && (
                          <span className="flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-800 text-xs font-bold rounded">
                            <Building2 className="w-3 h-3" />
                            {reservation.nombreAgencia}
                          </span>
                        )}
                      </h3>
                      {isToday && (
                        <span className="px-2 py-1 bg-orange-500 text-white text-xs font-bold rounded animate-pulse">
                          ¡HOY!
                        </span>
                      )}
                    </div>
                    <p className="text-gray-600">{formatDate(reservation.fecha)}</p>
                    <p className="text-sm text-gray-500">{reservation.local}</p>
                  </div>
                  <span className="px-3 py-1 rounded-full text-sm font-bold bg-orange-100 text-orange-800">
                    Pendiente
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <p className="text-sm text-gray-600">Personas</p>
                    <p className="text-lg font-bold text-gray-900">{reservation.asistentes}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Total Cena</p>
                    <p className="text-lg font-bold text-gray-900">{formatCurrency(reservation.precioTotal)}</p>
                  </div>
                  {reservation.vieneDeAgencia ? (
                    <div>
                      <p className="text-sm text-blue-600">Comisión Agencia</p>
                      <p className="text-lg font-bold text-blue-600">{formatCurrency(reservation.comisionAgencia)}</p>
                    </div>
                  ) : (
                    <div>
                      <p className="text-sm text-green-600">Reserva Pagada</p>
                      <p className="text-lg font-bold text-green-600">{formatCurrency(reservation.reservaPagada)}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-sm text-orange-600">A Cobrar</p>
                    <p className="text-xl font-bold text-orange-600">{formatCurrency(pendiente)}</p>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      const msg = generateWhatsAppMessage(reservation);
                      const url = `https://wa.me/${reservation.contacto.replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`;
                      window.open(url, '_blank');
                    }}
                    className="flex-1 bg-green-500 hover:bg-green-600 text-white py-3 px-4 rounded-lg font-bold flex items-center justify-center gap-2"
                  >
                    <Send className="w-5 h-5" />
                    WhatsApp
                  </button>
                  <button
                    onClick={() => marcarCobradoCompleto(reservation.id)}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-3 px-4 rounded-lg font-bold flex items-center justify-center gap-2"
                  >
                    <CheckCircle2 className="w-5 h-5" />
                    Cobrado Completo
                  </button>
                </div>
              </div>
            );
          })
        ) : (
          <div className="bg-white p-12 rounded-xl shadow-md text-center">
            <CheckCircle2 className="w-16 h-16 mx-auto mb-4 text-green-300" />
            <p className="text-gray-500">¡Todo cobrado! No hay pendientes</p>
          </div>
        )}
      </div>
    );
  };

  const renderResumenView = () => {
    const saturdays = getSeasonSaturdays();
    const monthsData: { [key: number]: { asistentes: number; dinero: number; grupos: number } } = {};

    // Agrupar por mes
    saturdays.forEach(saturday => {
      const month = saturday.getMonth();
      if (!monthsData[month]) {
        monthsData[month] = { asistentes: 0, dinero: 0, grupos: 0 };
      }
    });

    // Calcular totales por sábado
    const saturdayData = saturdays.map(saturday => {
      const dayReservations = getReservationsForDate(saturday);
      const totalAsistentes = dayReservations.reduce((sum, r) => sum + r.asistentes, 0);
      const totalDinero = dayReservations.reduce((sum, r) => {
        // Si es "Otra agencia", solo sumamos lo que nosotros cobramos (total - comisión)
        if (r.vieneDeAgencia && r.nombreAgencia === 'Otra agencia') {
          return sum + (r.precioTotal - r.comisionAgencia);
        }
        return sum + r.precioTotal;
      }, 0);

      const month = saturday.getMonth();
      monthsData[month].asistentes += totalAsistentes;
      monthsData[month].dinero += totalDinero;
      monthsData[month].grupos += dayReservations.length;

      return {
        fecha: saturday,
        asistentes: totalAsistentes,
        dinero: totalDinero,
        grupos: dayReservations.length
      };
    });

    return (
      <div className="space-y-6">
        {/* Resumen Mensual */}
        <div className="bg-white rounded-xl shadow-md p-6">
          <h3 className="text-2xl font-bold text-gray-900 mb-4 flex items-center gap-2">
            <DollarSign className="w-6 h-6 text-purple-600" />
            Resumen Mensual
          </h3>
          <div className="grid md:grid-cols-3 lg:grid-cols-6 gap-4">
            {availableMonths.map(month => (
              <div key={month} className="bg-gradient-to-br from-purple-50 to-blue-50 p-4 rounded-lg border-2 border-purple-200">
                <p className="text-sm font-bold text-purple-700 uppercase">{monthNames[month]}</p>
                <div className="mt-2 space-y-1">
                  <div className="text-xs text-gray-600">
                    Grupos: <span className="font-bold text-gray-900">{monthsData[month]?.grupos || 0}</span>
                  </div>
                  <div className="text-xs text-gray-600">
                    Personas: <span className="font-bold text-gray-900">{monthsData[month]?.asistentes || 0}</span>
                  </div>
                  <div className="text-sm font-bold text-purple-900">
                    {formatCurrency(monthsData[month]?.dinero || 0)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Resumen por Sábado */}
        <div className="bg-white rounded-xl shadow-md overflow-hidden">
          <div className="p-6 border-b border-gray-200">
            <h3 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Calendar className="w-6 h-6 text-blue-600" />
              Resumen por Sábado
            </h3>
          </div>
          <table className="w-full">
            <thead className="bg-gray-50 border-b-2 border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase">Fecha</th>
                <th className="px-4 py-3 text-center text-xs font-bold text-gray-700 uppercase">Grupos</th>
                <th className="px-4 py-3 text-center text-xs font-bold text-gray-700 uppercase">Asistentes</th>
                <th className="px-4 py-3 text-right text-xs font-bold text-gray-700 uppercase">Total €</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {saturdayData
                .filter(d => d.grupos > 0)
                .map(data => (
                  <tr key={data.fecha.toISOString()} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">
                      {formatDate(data.fecha)}
                    </td>
                    <td className="px-4 py-3 text-sm text-center text-gray-700">
                      {data.grupos}
                    </td>
                    <td className="px-4 py-3 text-sm text-center font-bold text-gray-900">
                      {data.asistentes}
                    </td>
                    <td className="px-4 py-3 text-sm font-bold text-right text-purple-700">
                      {formatCurrency(data.dinero)}
                    </td>
                  </tr>
                ))}
            </tbody>
            <tfoot className="bg-gray-100 border-t-2 border-gray-300">
              <tr>
                <td className="px-4 py-3 text-sm font-bold text-gray-900 uppercase">TOTAL TEMPORADA</td>
                <td className="px-4 py-3 text-sm text-center font-bold text-gray-900">
                  {saturdayData.reduce((sum, d) => sum + d.grupos, 0)}
                </td>
                <td className="px-4 py-3 text-sm text-center font-bold text-gray-900">
                  {saturdayData.reduce((sum, d) => sum + d.asistentes, 0)}
                </td>
                <td className="px-4 py-3 text-lg font-bold text-right text-purple-900">
                  {formatCurrency(saturdayData.reduce((sum, d) => sum + d.dinero, 0))}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b-2 border-blue-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
                  <Calendar className="w-8 h-8 text-blue-600" />
                  Calendario de Reservas
                </h1>
                <p className="text-gray-600 mt-1">Gestión de cenas de grupos - Temporada 2026</p>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={exportData}
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium transition-colors flex items-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  Exportar
                </button>
                <label className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium transition-colors flex items-center gap-2 cursor-pointer">
                  <Upload className="w-4 h-4" />
                  Importar
                  <input type="file" accept=".json" onChange={importData} className="hidden" />
                </label>
              </div>
            </div>

            {/* Search Bar */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar por grupo, teléfono, local o notas..."
                className="w-full pl-10 pr-4 py-3 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
        </div>
      </header>

      {/* Stats */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
          <div className="bg-white p-4 rounded-xl shadow-sm border-2 border-blue-100">
            <p className="text-sm text-gray-600">Total Reservas</p>
            <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
          </div>
          <div className="bg-yellow-50 p-4 rounded-xl shadow-sm border-2 border-yellow-200">
            <p className="text-sm text-yellow-700">Con Reserva</p>
            <p className="text-2xl font-bold text-yellow-900">{stats.reservasPagadas}</p>
          </div>
          <div className="bg-green-50 p-4 rounded-xl shadow-sm border-2 border-green-200">
            <p className="text-sm text-green-700">Cobradas</p>
            <p className="text-2xl font-bold text-green-900">{stats.cobradas}</p>
          </div>
          <div className="bg-purple-50 p-4 rounded-xl shadow-sm border-2 border-purple-200">
            <p className="text-sm text-purple-700">Ya Recibido</p>
            <p className="text-2xl font-bold text-purple-900">{formatCurrency(stats.totalReservas)}</p>
          </div>
          <div className="bg-blue-50 p-4 rounded-xl shadow-sm border-2 border-blue-200">
            <p className="text-sm text-blue-700">Cobrado</p>
            <p className="text-2xl font-bold text-blue-900">{formatCurrency(stats.totalCobrado)}</p>
          </div>
          <div className="bg-orange-50 p-4 rounded-xl shadow-sm border-2 border-orange-200">
            <p className="text-sm text-orange-700">Pendiente</p>
            <p className="text-2xl font-bold text-orange-900">{formatCurrency(stats.pendienteCobrar)}</p>
          </div>
        </div>
      </div>

      {/* View Tabs */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-6">
        <div className="bg-white p-2 rounded-xl shadow-sm border-2 border-gray-200 flex gap-2 flex-wrap">
          <button
            onClick={() => setViewMode('calendar')}
            className={`flex-1 py-3 px-4 rounded-lg font-bold transition-colors flex items-center justify-center gap-2 ${
              viewMode === 'calendar'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <Calendar className="w-5 h-5" />
            Calendario
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`flex-1 py-3 px-4 rounded-lg font-bold transition-colors flex items-center justify-center gap-2 ${
              viewMode === 'list'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <List className="w-5 h-5" />
            Lista
          </button>
          <button
            onClick={() => setViewMode('pendientes')}
            className={`flex-1 py-3 px-4 rounded-lg font-bold transition-colors flex items-center justify-center gap-2 ${
              viewMode === 'pendientes'
                ? 'bg-orange-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <AlertCircle className="w-5 h-5" />
            Pendientes
          </button>
          <button
            onClick={() => setViewMode('resumen')}
            className={`flex-1 py-3 px-4 rounded-lg font-bold transition-colors flex items-center justify-center gap-2 ${
              viewMode === 'resumen'
                ? 'bg-purple-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <DollarSign className="w-5 h-5" />
            Resumen
          </button>
        </div>
      </div>

      {/* Month Filter (only for calendar view) */}
      {viewMode === 'calendar' && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-6">
          <div className="bg-white p-4 rounded-xl shadow-sm border-2 border-gray-200 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Clock className="w-5 h-5 text-blue-600" />
              <h2 className="text-lg font-bold text-gray-800">Selecciona el mes</h2>
            </div>
            <div className="flex gap-2 flex-wrap">
              {availableMonths.map(m => (
                <button
                  key={m}
                  onClick={() => setSelectedMonth(m)}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    selectedMonth === m
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {monthNames[m]}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12">
        {viewMode === 'calendar' && renderCalendarView()}
        {viewMode === 'list' && renderListView()}
        {viewMode === 'pendientes' && renderPendientesView()}
        {viewMode === 'resumen' && renderResumenView()}
      </div>

      {showModal && <ReservationModal />}
    </div>
  );
}
