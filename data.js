import { PROMPTS_EXTRA } from './prompts-extra.js';
// Contenido de la app. Formato de cada línea del mazo:
// inglés|español|frase de ejemplo|traducción del ejemplo
import { X1 } from './deck-l1.js';
import { X2 } from './deck-l2.js';
import { X3 } from './deck-l3.js';
import { Y1 } from './deck-l1b.js';
import { Y2 } from './deck-l2b.js';
import { Y3 } from './deck-l3b.js';
import { Z1, Z2, Z3 } from './deck-extra.js';

const L1 = `
hello|hola|Hello, how are you?|Hola, ¿cómo estás?
thanks|gracias|Thanks for your help.|Gracias por tu ayuda.
please|por favor|A coffee, please.|Un café, por favor.
sorry|perdón|Sorry, I'm late.|Perdón, llego tarde.
excuse me|disculpe|Excuse me, where is the toilet?|Disculpe, ¿dónde está el baño?
how are you?|¿cómo estás?|Hi Tom, how are you?|Hola Tom, ¿cómo estás?
I'm good|estoy bien|I'm good, thanks.|Estoy bien, gracias.
see you later|nos vemos luego|Bye, see you later.|Chau, nos vemos luego.
I don't understand|no entiendo|Sorry, I don't understand.|Perdón, no entiendo.
can you repeat that?|¿podés repetir eso?|Sorry, can you repeat that?|Perdón, ¿podés repetir eso?
how much is it?|¿cuánto cuesta?|I like this one. How much is it?|Me gusta este. ¿Cuánto cuesta?
I need|necesito|I need a coffee.|Necesito un café.
I want|quiero|I want to go home.|Quiero ir a casa.
I like|me gusta|I like this place.|Me gusta este lugar.
I have|tengo|I have two brothers.|Tengo dos hermanos.
I think|creo|I think it's a good idea.|Creo que es una buena idea.
I don't know|no sé|I don't know his name.|No sé su nombre.
I can|puedo|I can help you.|Puedo ayudarte.
to go|ir|I go to work by bus.|Voy al trabajo en colectivo.
to come|venir|Can you come to my house?|¿Podés venir a mi casa?
to eat|comer|I eat lunch at one.|Almuerzo a la una.
to drink|beber|I drink a lot of water.|Tomo mucha agua.
to sleep|dormir|I sleep eight hours.|Duermo ocho horas.
to work|trabajar|I work from home.|Trabajo desde casa.
to buy|comprar|I need to buy milk.|Necesito comprar leche.
to pay|pagar|Can I pay by card?|¿Puedo pagar con tarjeta?
to see|ver|I can't see the screen.|No puedo ver la pantalla.
to listen|escuchar|I listen to music every day.|Escucho música todos los días.
to speak|hablar|I speak a little English.|Hablo un poco de inglés.
to say|decir|How do you say this in English?|¿Cómo se dice esto en inglés?
to ask|preguntar|Can I ask you something?|¿Te puedo preguntar algo?
to help|ayudar|Can you help me, please?|¿Me podés ayudar, por favor?
to wait|esperar|Wait a minute, please.|Esperá un minuto, por favor.
to open|abrir|Can you open the window?|¿Podés abrir la ventana?
to close|cerrar|The shop closes at six.|El local cierra a las seis.
to give|dar|Give me a second.|Dame un segundo.
to take|tomar, llevar|I take the train every morning.|Tomo el tren todas las mañanas.
to make|hacer, preparar|I make breakfast for my family.|Preparo el desayuno para mi familia.
to do|hacer|What do you do on weekends?|¿Qué hacés los fines de semana?
to find|encontrar|I can't find my keys.|No encuentro mis llaves.
to use|usar|Can I use your phone?|¿Puedo usar tu teléfono?
to call|llamar|I'll call you tomorrow.|Te llamo mañana.
to cook|cocinar|I cook dinner every night.|Cocino la cena todas las noches.
to walk|caminar|I walk to the shop.|Voy caminando al negocio.
to live|vivir|I live near the beach.|Vivo cerca de la playa.
to learn|aprender|I'm learning English.|Estoy aprendiendo inglés.
to try|probar, intentar|I want to try this food.|Quiero probar esta comida.
to start|empezar|I start work at nine.|Empiezo a trabajar a las nueve.
to finish|terminar|I finish at five.|Termino a las cinco.
to know|saber, conocer|I know this song.|Conozco esta canción.
water|agua|Can I have some water?|¿Me das un poco de agua?
food|comida|The food is very good here.|La comida es muy buena acá.
breakfast|desayuno|I have eggs for breakfast.|Como huevos en el desayuno.
lunch|almuerzo|What do you want for lunch?|¿Qué querés para el almuerzo?
dinner|cena|Dinner is ready.|La cena está lista.
coffee|café|I need a coffee.|Necesito un café.
house|casa|My house is small.|Mi casa es chica.
room|habitación|This is my room.|Esta es mi habitación.
kitchen|cocina|The kitchen is clean.|La cocina está limpia.
bathroom|baño|The bathroom is upstairs.|El baño está arriba.
bed|cama|I go to bed at eleven.|Me acuesto a las once.
door|puerta|Please close the door.|Por favor cerrá la puerta.
key|llave|Where is my key?|¿Dónde está mi llave?
phone|teléfono|My phone is dead.|Mi teléfono se quedó sin batería.
money|dinero|I don't have much money.|No tengo mucha plata.
card|tarjeta|Cash or card?|¿Efectivo o tarjeta?
shop|negocio, tienda|The shop is open.|El negocio está abierto.
street|calle|I live on this street.|Vivo en esta calle.
car|auto|My car is old.|Mi auto es viejo.
bus|colectivo|The bus is late again.|El colectivo llega tarde otra vez.
train|tren|The next train is at ten.|El próximo tren es a las diez.
job|trabajo|I like my job.|Me gusta mi trabajo.
friend|amigo|She is my best friend.|Ella es mi mejor amiga.
family|familia|My family lives in Argentina.|Mi familia vive en Argentina.
day|día|Have a nice day!|¡Que tengas un lindo día!
week|semana|See you next week.|Nos vemos la semana que viene.
today|hoy|I'm busy today.|Hoy estoy ocupado.
tomorrow|mañana|See you tomorrow.|Nos vemos mañana.
yesterday|ayer|I saw her yesterday.|La vi ayer.
morning|mañana (del día)|I run in the morning.|Corro a la mañana.
night|noche|Good night, sleep well.|Buenas noches, que duermas bien.
time|hora, tiempo|What time is it?|¿Qué hora es?
now|ahora|I'm busy right now.|Estoy ocupado ahora mismo.
later|más tarde|I'll do it later.|Lo hago más tarde.
always|siempre|I always have coffee first.|Siempre tomo café primero.
never|nunca|I never eat meat.|Nunca como carne.
sometimes|a veces|Sometimes I work at night.|A veces trabajo de noche.
good|bueno|This is really good.|Esto está muy bueno.
bad|malo|The weather is bad today.|El clima está feo hoy.
big|grande|It's a big city.|Es una ciudad grande.
small|chico|Do you have a small one?|¿Tenés uno chico?
hot|caliente, caluroso|It's very hot today.|Hoy hace mucho calor.
cold|frío|The water is cold.|El agua está fría.
new|nuevo|I have a new job.|Tengo un trabajo nuevo.
old|viejo|This phone is very old.|Este teléfono es muy viejo.
cheap|barato|This shop is cheap.|Este negocio es barato.
expensive|caro|Sydney is expensive.|Sídney es caro.
easy|fácil|It's easy, look.|Es fácil, mirá.
difficult|difícil|English is difficult sometimes.|El inglés es difícil a veces.
tired|cansado|I'm so tired today.|Estoy muy cansado hoy.
hungry|con hambre|I'm hungry. Let's eat.|Tengo hambre. Comamos.
happy|contento|I'm happy to be here.|Estoy contento de estar acá.
busy|ocupado|Are you busy tonight?|¿Estás ocupado esta noche?
ready|listo|Are you ready to go?|¿Estás listo para salir?
late|tarde|Hurry up, we're late.|Apurate, llegamos tarde.
early|temprano|I get up early.|Me levanto temprano.
here|acá|Come here, please.|Vení acá, por favor.
there|allá|Put it over there.|Ponelo allá.
because|porque|I'm tired because I slept badly.|Estoy cansado porque dormí mal.
but|pero|I want to go, but I can't.|Quiero ir, pero no puedo.
very|muy|It's very nice.|Es muy lindo.
a lot|mucho|I work a lot.|Trabajo mucho.
a little|un poco|I speak a little English.|Hablo un poco de inglés.
maybe|quizás|Maybe tomorrow.|Quizás mañana.
of course|por supuesto|Of course you can.|Por supuesto que podés.
`;

const L2 = `
I'm looking for|estoy buscando|I'm looking for a chemist.|Estoy buscando una farmacia.
I'd like|quisiera|I'd like a flat white, please.|Quisiera un flat white, por favor.
what do you mean?|¿qué querés decir?|Sorry, what do you mean?|Perdón, ¿qué querés decir?
it depends|depende|It depends on the weather.|Depende del clima.
let me know|avisame|Let me know if you need anything.|Avisame si necesitás algo.
by the way|por cierto|By the way, are you free on Friday?|Por cierto, ¿estás libre el viernes?
actually|en realidad|Actually, I changed my mind.|En realidad, cambié de opinión.
anyway|en fin, igual|Anyway, I have to go.|En fin, me tengo que ir.
I guess|supongo|I guess you're right.|Supongo que tenés razón.
I'm not sure|no estoy seguro|I'm not sure what time it starts.|No estoy seguro de a qué hora empieza.
it doesn't matter|no importa|It doesn't matter, forget it.|No importa, olvidalo.
on my way|en camino|I'm on my way.|Estoy en camino.
in a hurry|apurado|Sorry, I'm in a hurry.|Perdón, estoy apurado.
take your time|tomate tu tiempo|No rush, take your time.|Sin apuro, tomate tu tiempo.
worth it|vale la pena|It's expensive, but it's worth it.|Es caro, pero vale la pena.
to get up|levantarse|I get up at six thirty.|Me levanto a las seis y media.
to pick up|pasar a buscar|I'll pick you up at eight.|Te paso a buscar a las ocho.
to look for|buscar|I'm looking for a new flat.|Estoy buscando un departamento nuevo.
to find out|averiguar|I'll find out and tell you.|Averiguo y te cuento.
to run out of|quedarse sin|We ran out of milk.|Nos quedamos sin leche.
to turn on|prender|Can you turn on the light?|¿Podés prender la luz?
to turn off|apagar|Turn off the TV, please.|Apagá la tele, por favor.
to book|reservar|I booked a table for two.|Reservé una mesa para dos.
to borrow|pedir prestado|Can I borrow your charger?|¿Me prestás tu cargador?
to lend|prestar|Can you lend me ten dollars?|¿Me prestás diez dólares?
to forget|olvidar|I forgot my wallet.|Me olvidé la billetera.
to remember|recordar|I can't remember her name.|No me acuerdo de su nombre.
to miss|extrañar, perder|I missed the bus.|Perdí el colectivo.
to spend|gastar, pasar|I spend too much on food.|Gasto demasiado en comida.
to save|ahorrar|I'm saving for a trip.|Estoy ahorrando para un viaje.
to fix|arreglar|Can you fix my bike?|¿Podés arreglar mi bici?
to bring|traer|Can I bring a friend?|¿Puedo traer a un amigo?
to meet|conocer, encontrarse|Let's meet at the station.|Encontrémonos en la estación.
to feel|sentirse|I don't feel well today.|Hoy no me siento bien.
to seem|parecer|She seems nice.|Parece simpática.
to agree|estar de acuerdo|I agree with you.|Estoy de acuerdo con vos.
appointment|turno, cita|I have a doctor's appointment.|Tengo turno con el médico.
bill|cuenta, factura|Can we have the bill, please?|¿Nos traés la cuenta, por favor?
receipt|ticket, recibo|Do you need a receipt?|¿Necesitás el ticket?
change|vuelto, cambio|Keep the change.|Quedate con el vuelto.
rent|alquiler|The rent is due on Monday.|El alquiler vence el lunes.
flatmate|compañero de depto|My flatmate is from Brazil.|Mi compañero de depto es de Brasil.
neighbour|vecino|My neighbours are very quiet.|Mis vecinos son muy tranquilos.
weather|clima|The weather is lovely today.|El clima está hermoso hoy.
traffic|tránsito|The traffic is terrible this morning.|El tránsito está terrible esta mañana.
meeting|reunión|I have a meeting at three.|Tengo una reunión a las tres.
deadline|fecha límite|The deadline is tomorrow.|La fecha límite es mañana.
weekend|fin de semana|What are you doing this weekend?|¿Qué hacés este fin de semana?
holiday|vacaciones|I'm on holiday next week.|Estoy de vacaciones la semana que viene.
ticket|boleto, entrada|I bought two tickets online.|Compré dos entradas por internet.
queue|fila|There is a long queue.|Hay una fila larga.
discount|descuento|Is there a student discount?|¿Hay descuento para estudiantes?
enough|suficiente|We don't have enough time.|No tenemos suficiente tiempo.
almost|casi|I'm almost ready.|Estoy casi listo.
already|ya|I've already eaten.|Ya comí.
still|todavía|Are you still at work?|¿Todavía estás en el trabajo?
not yet|todavía no|Have you finished? Not yet.|¿Terminaste? Todavía no.
usually|normalmente|I usually walk to work.|Normalmente voy caminando al trabajo.
quite|bastante|It's quite far from here.|Queda bastante lejos de acá.
instead|en cambio, en lugar|Let's stay home instead.|Mejor quedémonos en casa.
both|ambos|I like both of them.|Me gustan los dos.
available|disponible|Is this table available?|¿Esta mesa está disponible?
comfortable|cómodo|These shoes are really comfortable.|Estos zapatos son muy cómodos.
crowded|lleno de gente|The train was really crowded.|El tren estaba llenísimo.
broken|roto|My screen is broken.|Mi pantalla está rota.
worried|preocupado|I'm worried about the exam.|Estoy preocupado por el examen.
annoying|molesto|That noise is so annoying.|Ese ruido es muy molesto.
favourite|favorito|What's your favourite food?|¿Cuál es tu comida favorita?
`;

const L3 = `
to figure out|resolver, entender|I can't figure out this app.|No logro entender esta app.
to come up with|ocurrírsele|She came up with a great idea.|Se le ocurrió una gran idea.
to get along with|llevarse bien con|I get along with my boss.|Me llevo bien con mi jefe.
to put up with|aguantar|I can't put up with the noise.|No aguanto el ruido.
to look forward to|tener ganas de|I'm looking forward to the weekend.|Tengo muchas ganas de que llegue el finde.
to catch up|ponerse al día|Let's catch up over coffee.|Pongámonos al día con un café.
to end up|terminar (haciendo)|We ended up staying home.|Terminamos quedándonos en casa.
to deal with|lidiar con|I'll deal with it tomorrow.|Me ocupo de eso mañana.
to give up|rendirse, dejar|Don't give up now.|No te rindas ahora.
to run into|cruzarse con|I ran into an old friend.|Me crucé con un viejo amigo.
to show up|aparecer|He didn't show up to the meeting.|No apareció en la reunión.
to hang out|pasar el rato|We hang out on Sundays.|Nos juntamos los domingos.
to sort out|resolver, organizar|I need to sort out my visa.|Tengo que resolver lo de mi visa.
to point out|señalar|Thanks for pointing that out.|Gracias por señalarlo.
to bring up|sacar un tema|Don't bring up money at dinner.|No saques el tema de la plata en la cena.
to turn out|resultar|It turned out to be easy.|Resultó ser fácil.
to put off|postergar|I keep putting off the dentist.|Sigo postergando el dentista.
to get used to|acostumbrarse a|I'm getting used to the accent.|Me estoy acostumbrando al acento.
to make up your mind|decidirse|I can't make up my mind.|No me puedo decidir.
to afford|poder pagar|I can't afford a car right now.|Ahora no puedo pagar un auto.
to struggle|costarle a uno|I struggle with phone calls in English.|Me cuestan las llamadas en inglés.
to manage to|lograr|I managed to finish on time.|Logré terminar a tiempo.
to make sense|tener sentido|That doesn't make sense to me.|Eso no tiene sentido para mí.
it's up to you|depende de vos|We can go or stay, it's up to you.|Podemos ir o quedarnos, depende de vos.
to be honest|para ser sincero|To be honest, I didn't like it.|Para ser sincero, no me gustó.
as far as I know|que yo sepa|As far as I know, it's free.|Que yo sepa, es gratis.
I was wondering if|quería saber si|I was wondering if you could help me.|Quería saber si me podrías ayudar.
no wonder|con razón|No wonder you're tired.|Con razón estás cansado.
fair enough|está bien, entiendo|You're busy? Fair enough.|¿Estás ocupado? Está bien.
on the other hand|por otro lado|On the other hand, it's cheaper.|Por otro lado, es más barato.
in the long run|a la larga|It's better in the long run.|A la larga es mejor.
sooner or later|tarde o temprano|Sooner or later you'll get it.|Tarde o temprano te va a salir.
what are you up to?|¿en qué andás?|Hey, what are you up to tonight?|Che, ¿en qué andás esta noche?
awkward|incómodo|There was an awkward silence.|Hubo un silencio incómodo.
reliable|confiable|My car isn't very reliable.|Mi auto no es muy confiable.
straightforward|sencillo, directo|The process is pretty straightforward.|El proceso es bastante sencillo.
overwhelmed|abrumado|I feel a bit overwhelmed at work.|Me siento un poco abrumado en el trabajo.
roughly|más o menos|It takes roughly an hour.|Tarda más o menos una hora.
`;

const AU = `
g'day|hola (saludo australiano)|G'day, how's it going?|Hola, ¿cómo va?
mate|amigo, che|Thanks, mate.|Gracias, amigo.
no worries|no hay problema, de nada|No worries, I'll do it.|No hay problema, lo hago yo.
how ya going?|¿cómo andás?|Hey mate, how ya going?|Hola amigo, ¿cómo andás?
arvo|tarde (afternoon)|See you this arvo.|Nos vemos esta tarde.
brekkie|desayuno|Let's get brekkie at the cafe.|Vamos a desayunar al café.
reckon|creer, opinar|I reckon it will rain.|Creo que va a llover.
heaps|un montón|Thanks heaps!|¡Mil gracias!
keen|con ganas|Are you keen for a swim?|¿Tenés ganas de nadar?
ta|gracias (informal)|Ta, that's perfect.|Gracias, está perfecto.
cheers|gracias, salud|Cheers for the lift.|Gracias por llevarme.
too easy|listo, ningún problema|Can you send it today? Too easy.|¿Lo podés mandar hoy? Listo.
good on ya|bien hecho|You got the job? Good on ya!|¿Conseguiste el trabajo? ¡Bien ahí!
she'll be right|va a salir bien|Don't stress, she'll be right.|No te estreses, va a salir bien.
yeah, nah|no (suave)|Yeah, nah, I'm not keen.|No, la verdad no tengo ganas.
servo|estación de servicio|I'll stop at the servo.|Paro en la estación de servicio.
bottle-o|tienda de bebidas|The bottle-o closes at nine.|La tienda de bebidas cierra a las nueve.
Macca's|McDonald's|Let's grab Macca's on the way.|Compremos McDonald's de camino.
thongs|ojotas|I wear thongs to the beach.|Voy a la playa en ojotas.
esky|heladerita portátil|Put the drinks in the esky.|Poné las bebidas en la heladerita.
ute|camioneta|He drives a white ute.|Maneja una camioneta blanca.
barbie|parrilla, asado|We're having a barbie on Sunday.|Hacemos un asado el domingo.
sunnies|anteojos de sol|I lost my sunnies.|Perdí mis anteojos de sol.
chockers|repleto|The pub was chockers.|El bar estaba repleto.
stuffed|agotado|I'm stuffed after that shift.|Estoy agotado después de ese turno.
flat out|a full, muy ocupado|I've been flat out all week.|Estuve a full toda la semana.
avo|palta|Smashed avo on toast, please.|Tostada con palta pisada, por favor.
footy|fútbol australiano / rugby|Did you watch the footy?|¿Viste el partido?
mozzie|mosquito|The mozzies are bad tonight.|Hay muchos mosquitos esta noche.
smoko|descanso corto|Let's talk at smoko.|Hablemos en el descanso.
tradie|obrero, técnico de oficio|The tradie is coming at seven.|El técnico viene a las siete.
chuck a sickie|faltar fingiendo enfermedad|He chucked a sickie on Monday.|El lunes faltó diciendo que estaba enfermo.
have a go|intentarlo|Go on, have a go.|Dale, intentalo.
rego|patente, registro del auto|My rego is due next month.|El registro del auto vence el mes que viene.
`;

const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const parse = (raw, lvl, pre) => raw.split('\n').filter(l => l.trim()).map(l => {
  const [en, es, ex, exEs] = l.split('|');
  return { id: pre + slug(en), en, es, ex, exEs, lvl };
});

// Une las tandas y descarta entradas repetidas (gana la primera aparición).
const seen = new Set();
export const DECK = [...parse(L1 + X1 + Y1 + Z1, 1, 'g-'), ...parse(L2 + X2 + Y2 + Z2, 2, 'g-'), ...parse(L3 + X3 + Y3 + Z3, 3, 'g-')]
  .filter(e => !seen.has(e.id) && seen.add(e.id));
export const AUSSIE = parse(AU, 0, 'au-');

// Poco usadas en la conversación de todos los días: frases hechas rebuscadas, jerga muy regional y palabras más de
// texto escrito. No entran como palabras nuevas en los mazos (ver mazos() en anki.js), pero siguen en DECK para que
// quien ya las estaba repasando no pierda su progreso.
const RARE = new Set(`touch wood|to hit the nail on the head|to pull someone's leg|a blessing in disguise|the last straw|to rub it in
|to put your foot in it|to have a soft spot for|to turn a blind eye|to think outside the box|to go the extra mile|over the moon|on a roll
|to cut corners|to see eye to eye|to speak your mind|to be on the fence|to be in two minds|a long shot|the benefit of the doubt|to draw the line
|to get cold feet|to learn the hard way|to push your luck|to save the day|to catch off guard|to do the trick|it serves you right|the more the merrier
|practice makes perfect|to make ends meet|to cut a long story short|to sit tight|rule of thumb|the bottom line|word of mouth|side hustle|learning curve
|to muck around|to suss out|to stuff up|to whinge|I'm knackered|bring a plate|gutted|down the track|I'm not fussed|nevertheless|whereas|therefore
|on behalf of|to envy|to dread|sturdy|spacious|cramped|stuffy|witty|tedious|to weigh up|to narrow down|to snap at|mind you|for what it's worth`
  .split('|').map(x => slug(x.trim())));
for (const e of DECK) if (RARE.has(slug(e.en))) e.rare = true;

// Frases de shadowing: [nivel, inglés, español]
export const SHADOW = [
  [1, "Hi, how are you today?", "Hola, ¿cómo estás hoy?"],
  [1, "I'm good, thanks. And you?", "Estoy bien, gracias. ¿Y vos?"],
  [1, "Can I have a coffee, please?", "¿Me das un café, por favor?"],
  [1, "Where is the bus stop?", "¿Dónde está la parada del colectivo?"],
  [1, "I don't understand. Can you repeat that?", "No entiendo. ¿Podés repetir eso?"],
  [1, "How much is this one?", "¿Cuánto cuesta este?"],
  [1, "I work in the city.", "Trabajo en el centro."],
  [1, "I live with two friends.", "Vivo con dos amigos."],
  [1, "What time does the shop close?", "¿A qué hora cierra el negocio?"],
  [1, "I'm learning English every day.", "Estoy aprendiendo inglés todos los días."],
  [1, "Can I pay by card?", "¿Puedo pagar con tarjeta?"],
  [1, "I'm hungry. Let's eat something.", "Tengo hambre. Comamos algo."],
  [1, "See you tomorrow morning.", "Nos vemos mañana a la mañana."],
  [1, "It's very hot today.", "Hoy hace mucho calor."],
  [1, "I need to buy some food.", "Necesito comprar comida."],
  [1, "Sorry, I'm a little late.", "Perdón, llego un poco tarde."],
  [1, "Do you want some water?", "¿Querés un poco de agua?"],
  [1, "My phone is in the kitchen.", "Mi teléfono está en la cocina."],
  [1, "I like this place a lot.", "Me gusta mucho este lugar."],
  [1, "Thanks for your help.", "Gracias por tu ayuda."],
  [2, "I'm looking for a place to rent near the beach.", "Estoy buscando un lugar para alquilar cerca de la playa."],
  [2, "Could you let me know when it's ready?", "¿Me podrías avisar cuando esté listo?"],
  [2, "I usually get up early and go for a walk.", "Normalmente me levanto temprano y salgo a caminar."],
  [2, "Sorry, I forgot to bring my wallet.", "Perdón, me olvidé de traer la billetera."],
  [2, "What are you doing this weekend?", "¿Qué hacés este fin de semana?"],
  [2, "I'd like to book a table for tonight.", "Quisiera reservar una mesa para esta noche."],
  [2, "The train was crowded, so I took the bus instead.", "El tren estaba lleno, así que tomé el colectivo."],
  [2, "I'm not sure, but I think it starts at eight.", "No estoy seguro, pero creo que empieza a las ocho."],
  [2, "We ran out of milk. Can you pick some up?", "Nos quedamos sin leche. ¿Podés comprar?"],
  [2, "It's a bit expensive, but it's worth it.", "Es un poco caro, pero vale la pena."],
  [2, "I have an appointment in the afternoon.", "Tengo un turno a la tarde."],
  [2, "By the way, have you met my flatmate?", "Por cierto, ¿conocés a mi compañero de depto?"],
  [2, "I've already finished, so I can help you.", "Ya terminé, así que te puedo ayudar."],
  [2, "Take your time. I'm not in a hurry.", "Tomate tu tiempo. No estoy apurado."],
  [2, "The weather is lovely, let's go outside.", "El clima está hermoso, salgamos."],
  [3, "To be honest, I'm still getting used to the accent.", "Para ser sincero, todavía me estoy acostumbrando al acento."],
  [3, "I was wondering if you could help me sort this out.", "Quería saber si me podrías ayudar a resolver esto."],
  [3, "We were going to go out, but we ended up staying home.", "Íbamos a salir, pero terminamos quedándonos en casa."],
  [3, "I've been flat out all week, so I'm looking forward to the weekend.", "Estuve a full toda la semana, así que tengo ganas de que llegue el finde."],
  [3, "It took me a while to figure out how it works.", "Me llevó un rato entender cómo funciona."],
  [3, "As far as I know, the meeting has been put off until Monday.", "Que yo sepa, la reunión se postergó hasta el lunes."],
  [3, "I ran into an old friend and we caught up over coffee.", "Me crucé con un viejo amigo y nos pusimos al día con un café."],
  [3, "It's cheaper, but on the other hand it takes much longer.", "Es más barato, pero por otro lado tarda mucho más."],
  [3, "I can't afford it right now, but it will be worth it in the long run.", "Ahora no lo puedo pagar, pero a la larga va a valer la pena.",],
  [3, "No worries, it's up to you. I reckon either way is fine.", "No hay problema, depende de vos. Creo que cualquiera de las dos está bien."],
  [3, "I struggle with phone calls, but I manage to get by.", "Me cuestan las llamadas, pero me las arreglo."],
  [3, "It turned out to be pretty straightforward in the end.", "Al final resultó ser bastante sencillo."],
].map(([lvl, en, es], i) => ({ id: 's' + i, lvl, en, es }));

// Consignas para hablar. helps: frases de ayuda [inglés, español]
export const PROMPTS = [
  { lvl: 1, en: "Introduce yourself.", es: "Presentate: nombre, de dónde sos, a qué te dedicás.",
    helps: [["My name is...", "Me llamo..."], ["I'm from...", "Soy de..."], ["I work as...", "Trabajo de..."], ["I like...", "Me gusta..."]],
    model: "Hi, my name is Sam. I'm from Argentina. I work as a video editor. I like music and football." },
  { lvl: 1, en: "What did you have for breakfast?", es: "Contá qué desayunaste hoy.",
    helps: [["I had...", "Comí / tomé..."], ["I usually have...", "Normalmente tomo..."], ["I don't like...", "No me gusta..."]],
    model: "Today I had coffee and toast. I usually have eggs too. I don't like tea in the morning." },
  { lvl: 1, en: "Describe your house.", es: "Describí tu casa o departamento.",
    helps: [["I live in...", "Vivo en..."], ["It has...", "Tiene..."], ["My favourite room is...", "Mi ambiente favorito es..."], ["There is...", "Hay..."]],
    model: "I live in a small flat. It has one bedroom and a kitchen. My favourite room is the kitchen. There is a big window." },
  { lvl: 1, en: "What do you do every day?", es: "Contá tu rutina diaria.",
    helps: [["I get up at...", "Me levanto a las..."], ["Then I...", "Después..."], ["In the afternoon...", "A la tarde..."], ["At night...", "A la noche..."]],
    model: "I get up at seven. Then I have breakfast and go to work. In the afternoon I go to the gym. At night I cook dinner and watch a show." },
  { lvl: 1, en: "Talk about your family.", es: "Hablá de tu familia.",
    helps: [["I have...", "Tengo..."], ["My mum is...", "Mi mamá es..."], ["We live...", "Vivimos..."], ["We like to...", "Nos gusta..."]],
    model: "I have one brother and one sister. My mum is a teacher. We live in the same city. We like to eat together on Sundays." },
  { lvl: 1, en: "What food do you like?", es: "Contá qué comida te gusta y cuál no.",
    helps: [["I love...", "Me encanta..."], ["I don't like...", "No me gusta..."], ["My favourite food is...", "Mi comida favorita es..."]],
    model: "I love pasta and pizza. My favourite food is a good barbecue. I don't like fish very much." },
  { lvl: 1, en: "Order a coffee and something to eat.", es: "Simulá que pedís en un café.",
    helps: [["Can I have...", "¿Me das...?"], ["And a..., please.", "Y un..., por favor."], ["How much is it?", "¿Cuánto es?"], ["Can I pay by card?", "¿Puedo pagar con tarjeta?"]],
    model: "Hi! Can I have a flat white, please? And a toasted sandwich, please. How much is it? Can I pay by card? Thanks!" },
  { lvl: 1, en: "What are you doing today?", es: "Contá qué vas a hacer hoy.",
    helps: [["Today I'm going to...", "Hoy voy a..."], ["I need to...", "Necesito..."], ["After that...", "Después de eso..."]],
    model: "Today I'm going to work until five. I need to buy some food. After that I'm going to call my friend." },
  { lvl: 2, en: "Describe your last weekend.", es: "Contá qué hiciste el último fin de semana.",
    helps: [["On Saturday I...", "El sábado..."], ["We went to...", "Fuimos a..."], ["It was...", "Estuvo..."], ["I ended up...", "Terminé..."]],
    model: "On Saturday I met some friends and we went to the beach. It was really hot, so we stayed until sunset. On Sunday I ended up staying home and cooking." },
  { lvl: 2, en: "Talk about your job or studies.", es: "Hablá de tu trabajo o tus estudios.",
    helps: [["I work as...", "Trabajo de..."], ["I usually...", "Normalmente..."], ["The best part is...", "Lo mejor es..."], ["The hardest part is...", "Lo más difícil es..."]],
    model: "I work as a freelance editor. I usually work from home and talk to clients online. The best part is the freedom. The hardest part is finding new clients every month." },
  { lvl: 2, en: "Describe the place where you live.", es: "Describí tu barrio o ciudad.",
    helps: [["It's located...", "Está ubicado..."], ["There are a lot of...", "Hay muchos..."], ["What I like most is...", "Lo que más me gusta es..."], ["It can be...", "Puede ser..."]],
    model: "I live in a quiet area close to the city. There are a lot of cafes and a big park. What I like most is that I can walk everywhere. It can be noisy on weekends, though." },
  { lvl: 2, en: "Explain how to make a meal you like.", es: "Explicá cómo preparar una comida que te gusta.",
    helps: [["First you...", "Primero..."], ["Then you add...", "Después agregás..."], ["After that...", "Después de eso..."], ["Finally...", "Por último..."]],
    model: "First you boil the pasta for ten minutes. Then you add olive oil and garlic to a pan. After that you mix everything together. Finally, you put cheese on top." },
  { lvl: 2, en: "Talk about a trip you want to take.", es: "Hablá de un viaje que querés hacer.",
    helps: [["I'd like to go to...", "Me gustaría ir a..."], ["I've always wanted to...", "Siempre quise..."], ["I'm saving for...", "Estoy ahorrando para..."], ["It would be...", "Sería..."]],
    model: "I'd like to go to Australia next year. I've always wanted to see the Great Barrier Reef. I'm saving for the flights now. It would be the longest trip of my life." },
  { lvl: 2, en: "Call to book an appointment.", es: "Simulá una llamada para pedir un turno.",
    helps: [["I'd like to book...", "Quisiera reservar..."], ["Is there anything available...", "¿Hay algo disponible...?"], ["That works for me.", "Me queda bien."], ["Could you repeat that?", "¿Podría repetirlo?"]],
    model: "Hi, I'd like to book an appointment with the doctor. Is there anything available on Thursday morning? Ten o'clock? That works for me. Thanks very much." },
  { lvl: 3, en: "Describe a problem you solved recently.", es: "Contá un problema que resolviste hace poco.",
    helps: [["I had to deal with...", "Tuve que lidiar con..."], ["It turned out that...", "Resultó que..."], ["I figured out...", "Me di cuenta de..."], ["In the end...", "Al final..."]],
    model: "Last week I had to deal with a client who wasn't happy with a video. It turned out that the brief was unclear. I figured out what they really wanted by asking a few questions, and in the end they loved the new version." },
  { lvl: 3, en: "Give your opinion: is working from home better?", es: "Opiná: ¿es mejor trabajar desde casa?",
    helps: [["To be honest...", "Para ser sincero..."], ["On the other hand...", "Por otro lado..."], ["It depends on...", "Depende de..."], ["In the long run...", "A la larga..."]],
    model: "To be honest, I prefer working from home because I save time and money. On the other hand, it can be lonely. It depends on the kind of job you have. In the long run, I reckon a mix of both is best." },
  { lvl: 3, en: "Tell a story about something funny or awkward.", es: "Contá una anécdota graciosa o incómoda.",
    helps: [["A while ago...", "Hace un tiempo..."], ["All of a sudden...", "De repente..."], ["I ended up...", "Terminé..."], ["It was so awkward...", "Fue muy incómodo..."]],
    model: "A while ago I ran into someone I thought was an old friend. I gave him a big hug, and all of a sudden I realised it was a stranger. It was so awkward. I ended up apologising and we both laughed." },
  { lvl: 3, en: "Explain your goals for the next year.", es: "Explicá tus objetivos para el próximo año.",
    helps: [["I'm planning to...", "Estoy planeando..."], ["I'm looking forward to...", "Tengo ganas de..."], ["I want to get used to...", "Quiero acostumbrarme a..."], ["Sooner or later...", "Tarde o temprano..."]],
    model: "I'm planning to move abroad next year. I'm looking forward to meeting new people and improving my English. I want to get used to speaking every day. Sooner or later I'd like to start my own business." },
  { lvl: 3, en: "Convince a friend to visit your city.", es: "Convencé a un amigo de visitar tu ciudad.",
    helps: [["You should definitely...", "Sin duda tendrías que..."], ["It's well worth...", "Vale mucho la pena..."], ["You'll end up...", "Vas a terminar..."], ["Trust me...", "Creeme..."]],
    model: "You should definitely come and visit. The food is amazing and it's well worth staying at least a week. Trust me, you'll end up wanting to stay longer. I can show you all the best spots." },
  ...PROMPTS_EXTRA,  // prompts-extra.js: van al final para que los ids de arriba no cambien
].map((p, i) => ({ id: 'p' + i, ...p }));
