// Mazos de la tienda. Cada tarjeta: [inglés, español, ejemplo opcional]
import { SHADOW } from './data.js';
import { SCENES } from './practice-data.js';

const lines = raw => raw.trim().split('\n').map(l => l.split('|'));

const HOSPO = lines(`
What can I get you?|¿Qué te sirvo?|Hi there, what can I get you today?
Is that for here or to go?|¿Es para tomar acá o para llevar?|Is that for here or to go?
Would you like anything else?|¿Querés algo más?|Would you like anything else with that?
It'll be about ten minutes|Va a tardar unos diez minutos|Your food will be about ten minutes.
Table for how many?|¿Mesa para cuántos?|Good evening, table for how many?
Are you ready to order?|¿Están listos para pedir?|Are you ready to order, or do you need a minute?
I'll be right with you|Enseguida te atiendo|Take a seat, I'll be right with you.
We're out of that today|Hoy no nos queda eso|Sorry, we're out of the salmon today.
Any allergies I should know about?|¿Alguna alergia que deba saber?|Before you order, any allergies I should know about?
Can I take this plate?|¿Puedo llevarme este plato?|Are you finished? Can I take this plate?
How was everything?|¿Qué tal estuvo todo?|How was everything tonight?
Would you like the bill?|¿Quieren la cuenta?|Would you like the bill now?
Do you want to split the bill?|¿Quieren dividir la cuenta?|Do you want to split the bill or pay together?
Tap your card when you're ready|Apoyá la tarjeta cuando quieras|Tap your card on the machine when you're ready.
Would you like a receipt?|¿Querés el ticket?|Would you like a receipt with that?
Have a good one|Que estés bien|Thanks, have a good one!
regular or large?|¿común o grande?|Do you want a regular or large coffee?
full cream or skim?|¿leche entera o descremada?|Full cream or skim milk?
oat milk|leche de avena|Can I get that with oat milk?
extra shot|una medida extra de café|A flat white with an extra shot, please.
on the house|cortesía de la casa|Don't worry, this one's on the house.
to restock|reponer|Can you restock the fridge before you leave?
to wipe down|limpiar con un trapo|Please wipe down the tables after each customer.
the till|la caja registradora|I'll be on the till this morning.
the floor|el salón (atender mesas)|You're on the floor today with Sam.
to close up|cerrar el local|Who's closing up tonight?
to clock in|marcar la entrada|Don't forget to clock in when you arrive.
to clock off|marcar la salida|I clock off at four.
a shift swap|un cambio de turno|Can we do a shift swap on Friday?
the rush|la hora de más gente|The lunch rush starts at twelve.
behind!|¡paso por atrás! (aviso en la cocina)|Behind! Hot plates coming through.
eighty-six|se acabó (un plato)|The lamb is eighty-six for tonight.
to run food|llevar platos a las mesas|Can you run food to table five?
order up!|¡pedido listo!|Order up for table three!
`);

const TRAVEL = lines(`
Where is the check-in counter?|¿Dónde está el mostrador de check-in?|Excuse me, where is the check-in counter for Qantas?
Aisle or window?|¿Pasillo o ventanilla?|Would you prefer an aisle or window seat?
I'd like a window seat|Quisiera ventanilla|I'd like a window seat, please.
How many bags are you checking?|¿Cuántas valijas despachás?|How many bags are you checking in today?
Just carry-on|Solo equipaje de mano|No bags to check, just carry-on.
What gate is it?|¿Qué puerta es?|What gate is the flight to Melbourne?
The flight is delayed|El vuelo está demorado|Sorry, the flight is delayed by an hour.
Boarding starts at|El embarque empieza a las|Boarding starts at seven forty.
Purpose of your visit?|¿Motivo de tu visita?|What's the purpose of your visit?
I'm here on holiday|Vine de vacaciones|I'm here on holiday for three weeks.
I'm on a working holiday visa|Tengo visa de trabajo y vacaciones|I'm on a working holiday visa.
Anything to declare?|¿Algo para declarar?|Do you have anything to declare?
Where can I get a taxi?|¿Dónde tomo un taxi?|Where can I get a taxi into the city?
How do I get to the city?|¿Cómo llego al centro?|How do I get to the city from here?
Is breakfast included?|¿El desayuno está incluido?|Is breakfast included in the price?
I have a reservation under|Tengo una reserva a nombre de|I have a reservation under Martín.
What time is check-out?|¿A qué hora es el check-out?|What time is check-out tomorrow?
Could I leave my bags here?|¿Puedo dejar mis valijas acá?|Could I leave my bags here until three?
The wifi isn't working|El wifi no funciona|Sorry, the wifi isn't working in my room.
Can you recommend a good place to eat?|¿Me recomendás un buen lugar para comer?|Can you recommend a good place to eat nearby?
How long does it take to get there?|¿Cuánto se tarda en llegar?|How long does it take to get there by bus?
a return ticket|un pasaje de ida y vuelta|A return ticket to Bondi, please.
Does this bus go to?|¿Este colectivo va a?|Excuse me, does this bus go to the airport?
Which stop do I get off at?|¿En qué parada me bajo?|Which stop do I get off at for the museum?
I missed my connection|Perdí mi conexión|I missed my connection, what should I do?
My luggage didn't arrive|Mi equipaje no llegó|My luggage didn't arrive on the flight.
lost property|objetos perdidos|Where is lost property?
jet lag|desfase horario|I'm still a bit jet-lagged.
a layover|una escala|We have a four-hour layover in Auckland.
to rent a car|alquilar un auto|We want to rent a car for the weekend.
travel insurance|seguro de viaje|Don't travel without travel insurance.
a SIM card|un chip de celular|Where can I buy a SIM card?
`);

const shadow = SHADOW.map(p => [p.en, p.es, '']);
const scenes = SCENES.flatMap(s => s.steps.filter(x => x[0] === 'you').map(x => [x[2][0], x[1], s.title]));

// unlock: cuántas palabras sabidas hacen falta para que el mazo se agregue solo (si "Agregar mazos solos" está activado).
// apkg (opcional): en vez de "cards", la ruta a un mazo de Anki guardado junto a la web (ej. 'decks/phrasal-verbs.apkg').
// Se descarga una sola vez, cuando llegás al nivel, y queda guardado en el navegador.
export const PACKS = [
  { id: 'hospo', title: 'Trabajar en un café o restaurante', desc: 'Frases para atender clientes, la jerga de la cocina y los turnos.', cards: HOSPO, level: 'Intermedio', unlock: 600 },
  { id: 'travel', title: 'Aeropuerto, hotel y transporte', desc: 'Todo lo que necesitás para viajar: migraciones, valijas, check-in.', cards: TRAVEL, level: 'Básico', unlock: 150 },
  { id: 'shadow', title: 'Frases de shadowing', desc: 'Las frases del apartado de shadowing, para repasarlas como tarjetas.', cards: shadow, level: 'Todos', unlock: 900 },
  { id: 'scenes', title: 'Respuestas de las situaciones', desc: 'Las respuestas modelo de los diálogos de Practicar.', cards: scenes, level: 'Todos', unlock: 400 },
  { id: 'aussie', title: 'Jerga australiana', desc: '34 expresiones típicas: arvo, heaps, keen, no worries…', builtin: true, level: 'Todos', unlock: 1300 },
];
