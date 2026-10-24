"""Русские написания имён игроков для дашборда.

Три уровня (от точного к приближённому):
1. ``FULL`` — устоявшиеся написания заметных игроков (как в русскоязычной
   спортивной прессе: sports.ru, «Чемпионат»).
2. ``FIRST`` — словарь распространённых имён.
3. ``_translit`` — правила практической англо-русской транскрипции для
   остальных фамилий (приближённо; огрехи в экзотических фамилиях допустимы).
"""

from __future__ import annotations

import re
import unicodedata

# --- 1. Полные имена: устоявшиеся русские написания ---
FULL = {
    "Allen Iverson": "Аллен Айверсон", "Alperen Şengün": "Альперен Шенгюн",
    "Anderson Varejão": "Андерсон Варежао", "Andre Iguodala": "Андре Игудала",
    "Andrei Kirilenko": "Андрей Кириленко", "Andris Biedriņš": "Андрис Биедриньш",
    "Andrés Nocioni": "Андрес Носиони", "Anfernee Hardaway": "Анферни Хардуэй",
    "Anthony Davis": "Энтони Дэвис", "Arvydas Sabonis": "Арвидас Сабонис",
    "Bill Walton": "Билл Уолтон", "Bob Lanier": "Боб Ланье",
    "Bogdan Bogdanović": "Богдан Богданович", "Bojan Bogdanović": "Боян Богданович",
    "Brandon Roy": "Брэндон Рой", "Brent Barry": "Брент Бэрри",
    "Buck Williams": "Бак Уильямс", "Cade Cunningham": "Кейд Каннингем",
    "Carmelo Anthony": "Кармело Энтони", "Charles Barkley": "Чарльз Баркли",
    "Charles Oakley": "Чарльз Окли", "Chauncey Billups": "Чонси Биллапс",
    "Chris Paul": "Крис Пол", "Chris Webber": "Крис Уэббер",
    "Clifford Robinson": "Клиффорд Робинсон", "Clyde Drexler": "Клайд Дрекслер",
    "Dale Ellis": "Дейл Эллис", "Damian Lillard": "Дэмиан Лиллард",
    "Dario Šarić": "Дарио Шарич", "Darko Miličić": "Дарко Миличич",
    "Darrell Armstrong": "Даррелл Армстронг", "David Robinson": "Дэвид Робинсон",
    "DeMar DeRozan": "ДеМар ДеРозан", "DeMarcus Cousins": "ДеМаркус Казинс",
    "Dennis Schröder": "Деннис Шрёдер", "Derek Harper": "Дерек Харпер",
    "Derrick Rose": "Деррик Роуз", "Dirk Nowitzki": "Дирк Новицки",
    "Doc Rivers": "Док Риверс", "Domantas Sabonis": "Домантас Сабонис",
    "Dominique Wilkins": "Доминик Уилкинс", "Donovan Mitchell": "Донован Митчелл",
    "Draymond Green": "Дрэймонд Грин", "Dwight Howard": "Дуайт Ховард",
    "Dwyane Wade": "Дуэйн Уэйд", "Dāvis Bertāns": "Давис Бертанс",
    "Eduardo Nájera": "Эдуардо Нахера", "Elton Brand": "Элтон Брэнд",
    "Ersan İlyasova": "Эрсан Ильясова", "Francisco García": "Франсиско Гарсия",
    "Gary Payton": "Гэри Пэйтон", "Giannis Antetokounmpo": "Яннис Адетокунбо",
    "Goran Dragić": "Горан Драгич", "Gordan Giriček": "Гордан Гиричек",
    "Grant Hill": "Грант Хилл", "Greivis Vásquez": "Грейвис Васкес",
    "Hakeem Olajuwon": "Хаким Оладжувон", "Hedo Türkoğlu": "Хедо Туркоглу",
    "Horace Grant": "Хорас Грант", "Isaiah Thomas": "Айзея Томас",
    "Isiah Thomas": "Айзея Томас", "Ja Morant": "Джа Морант",
    "Jalen Brunson": "Джейлен Брансон", "Jamal Crawford": "Джамал Кроуфорд",
    "James Harden": "Джеймс Харден", "Jason Kidd": "Джейсон Кидд",
    "Jason Terry": "Джейсон Терри", "Jayson Tatum": "Джейсон Тейтум",
    "Jimmy Butler": "Джимми Батлер", "Joe Johnson": "Джо Джонсон",
    "Joel Embiid": "Джоэл Эмбиид", "John Stockton": "Джон Стоктон",
    "Jonas Valančiūnas": "Йонас Валанчюнас", "José Calderón": "Хосе Кальдерон",
    "Jrue Holiday": "Джру Холидэй", "Julius Erving": "Джулиус Ирвинг",
    "Jusuf Nurkić": "Юсуф Нуркич", "Kareem Abdul-Jabbar": "Карим Абдул-Джаббар",
    "Karl Malone": "Карл Мэлоун", "Karl-Anthony Towns": "Карл-Энтони Таунс",
    "Kawhi Leonard": "Кавай Леонард", "Kevin Durant": "Кевин Дюрант",
    "Kevin Garnett": "Кевин Гарнетт", "Kevin Johnson": "Кевин Джонсон",
    "Kevin Love": "Кевин Лав", "Kevin Willis": "Кевин Уиллис",
    "Kobe Bryant": "Коби Брайант", "Kristaps Porziņģis": "Кристапс Порзингис",
    "Kyle Lowry": "Кайл Лаури", "Kyrie Irving": "Кайри Ирвинг",
    "Larry Bird": "Ларри Бёрд", "LeBron James": "Леброн Джеймс",
    "Luka Dončić": "Лука Дончич", "Magic Johnson": "Мэджик Джонсон",
    "Manu Ginóbili": "Ману Джинобили", "Mark Jackson": "Марк Джексон",
    "Mark Price": "Марк Прайс", "Marko Jarić": "Марко Ярич",
    "Marques Johnson": "Маркес Джонсон", "Michael Jordan": "Майкл Джордан",
    "Mickaël Piétrus": "Микаэль Пьетрус", "Mike Conley": "Майк Конли",
    "Mookie Blaylock": "Муки Блэйлок", "Moses Malone": "Мозес Мэлоун",
    "Nate McMillan": "Нейт Макмиллан", "Nenad Krstić": "Ненад Крстич",
    "Nenê": "Нене", "Nicolas Batum": "Николя Батюм",
    "Nikola Jokić": "Никола Йокич", "Nikola Mirotić": "Никола Миротич",
    "Nikola Vučević": "Никола Вучевич", "Patrick Ewing": "Патрик Юинг",
    "Pau Gasol": "Пау Газоль", "Paul George": "Пол Джордж",
    "Paul Pierce": "Пол Пирс", "Paul Pressey": "Пол Пресси",
    "Peja Stojaković": "Пея Стоякович", "Rasho Nesterović": "Рашо Нестерович",
    "Ray Allen": "Рэй Аллен", "Reggie Miller": "Реджи Миллер",
    "Robert Parish": "Роберт Пэриш", "Rudy Gay": "Руди Гэй",
    "Russell Westbrook": "Расселл Уэстбрук", "Sasha Pavlović": "Саша Павлович",
    "Sasha Vujačić": "Саша Вуячич", "Scottie Pippen": "Скотти Пиппен",
    "Shai Gilgeous-Alexander": "Шей Гилджес-Александер",
    "Shaquille O'Neal": "Шакил О'Нил", "Shawn Marion": "Шон Мэрион",
    "Stephen Curry": "Стефен Карри", "Steve Nash": "Стив Нэш",
    "Terrell Brandon": "Террелл Брэндон", "Terry Porter": "Терри Портер",
    "Tim Duncan": "Тим Данкан", "Tim Hardaway": "Тим Хардуэй",
    "Tomáš Satoranský": "Томаш Саторанский", "Toni Kukoč": "Тони Кукоч",
    "Tony Parker": "Тони Паркер", "Tracy McGrady": "Трэйси Макгрейди",
    "Tyrese Haliburton": "Тайриз Халибертон", "Tyson Chandler": "Тайсон Чендлер",
    "Victor Oladipo": "Виктор Оладипо", "Vince Carter": "Винс Картер",
    "Vladimir Radmanović": "Владимир Радманович",
    "Šarūnas Marčiulionis": "Шарунас Марчюлёнис",
    "Yao Ming": "Яо Мин", "Zydrunas Ilgauskas": "Жидрунас Илгаускас",
    "Žydrūnas Ilgauskas": "Жидрунас Илгаускас", "Vlade Divac": "Владе Дивац",
    "Predrag Stojaković": "Предраг Стоякович", "Detlef Schrempf": "Детлеф Шремпф",
    "Rik Smits": "Рик Смитс", "Drazen Petrovic": "Дражен Петрович",
    "Dražen Petrović": "Дражен Петрович", "Wilt Chamberlain": "Уилт Чемберлен",
    "Bill Russell": "Билл Расселл", "Oscar Robertson": "Оскар Робертсон",
    "Jerry West": "Джерри Уэст", "Elgin Baylor": "Элджин Бэйлор",
    "Bob Pettit": "Боб Петтит", "Bob Cousy": "Боб Кузи",
    "John Havlicek": "Джон Хавличек", "Rick Barry": "Рик Бэрри",
    "Pete Maravich": "Пит Маравич", "Walt Frazier": "Уолт Фрейзер",
    "Dolph Schayes": "Дольф Шейес", "Dikembe Mutombo": "Дикембе Мутомбо",
    "Alonzo Mourning": "Алонзо Моурнинг", "Ben Wallace": "Бен Уоллес",
    "Rasheed Wallace": "Рашид Уоллес", "Chris Bosh": "Крис Бош",
    "Pau Gasol Sáez": "Пау Газоль", "Marc Gasol": "Марк Газоль",
    "Tony Allen": "Тони Аллен", "Andre Miller": "Андре Миллер",
    "Shawn Kemp": "Шон Кемп", "Gary Payton II": "Гэри Пэйтон II",
    "Tim Hardaway Jr.": "Тим Хардуэй-мл.", "Larry Nance Jr.": "Ларри Нэнс-мл.",
    "Larry Nance": "Ларри Нэнс", "Kelly Oubre Jr.": "Келли Убре-мл.",
    "Otto Porter Jr.": "Отто Портер-мл.", "Gary Trent Jr.": "Гэри Трент-мл.",
    "Kevin Porter Jr.": "Кевин Портер-мл.", "Michael Porter Jr.": "Майкл Портер-мл.",
    "Jaren Jackson Jr.": "Джарен Джексон-мл.", "Marvin Bagley III": "Марвин Бэгли III",
    "Glenn Robinson III": "Гленн Робинсон III", "Derrick Walton Jr.": "Деррик Уолтон-мл.",
    "Wendell Carter Jr.": "Уэнделл Картер-мл.", "Glen Rice": "Глен Райс",
    "Patty Mills": "Патти Миллс", "Joakim Noah": "Джоаким Ноа",
    "Al Horford": "Эл Хорфорд", "Ricky Rubio": "Рики Рубио",
    "Serge Ibaka": "Серж Ибака", "Tristan Thompson": "Тристан Томпсон",
    "Klay Thompson": "Клэй Томпсон", "Mychal Thompson": "Майкл Томпсон",
    "Zion Williamson": "Зайон Уильямсон", "Trae Young": "Трэй Янг",
    "Devin Booker": "Девин Букер", "Bam Adebayo": "Бэм Адебайо",
    "Pascal Siakam": "Паскаль Сиакам", "OG Anunoby": "О-Джи Ануноби",
    "Fred VanVleet": "Фред Ванвлит", "Jamal Murray": "Джамал Мюррей",
    "De'Aaron Fox": "Де'Аарон Фокс", "CJ McCollum": "Си-Джей Макколлум",
    "DeAndre Jordan": "ДеАндре Джордан", "JaVale McGee": "ДжаВейл Макги",
    "Dwane Casey": "Дуэйн Кейси", "Manute Bol": "Мануте Бол",
    "Arnie Risen": "Арни Райзен", "Dolph Schayes ": "Дольф Шейес",
    "Bill Sharman": "Билл Шарман", "Paul Arizin": "Пол Аризин",
    "Vern Mikkelsen": "Верн Миккельсен", "George Mikan": "Джордж Майкен",
    "Anthony Edwards": "Энтони Эдвардс", "LaMelo Ball": "ЛаМело Болл",
    "Lonzo Ball": "Лонзо Болл", "Darius Bazley": "Дариус Бэзли",
    "Andrew Bynum": "Эндрю Байнум", "Chet Holmgren": "Чет Холмгрен",
    "Victor Wembanyama": "Виктор Вембаньяма", "Paolo Banchero": "Паоло Банкеро",
    "Evan Mobley": "Эван Мобли", "Scottie Barnes": "Скотти Барнс",
    "Franz Wagner": "Франц Вагнер", "Jaylen Brown": "Джейлен Браун",
    "Jrue Holiday ": "Джру Холидэй", "Khris Middleton": "Крис Миддлтон",
    "Brook Lopez": "Брук Лопес", "Robin Lopez": "Робин Лопес",
    "Goga Bitadze": "Гога Битадзе", "Davis Bertans": "Давис Бертанс",
    "Boban Marjanović": "Бобан Марьянович", "Ivica Zubac": "Ивица Зубац",
    "Bojan Bogdanovic": "Боян Богданович", "Furkan Korkmaz": "Фуркан Коркмаз",
    "Cedi Osman": "Джеди Осман", "Frank Ntilikina": "Фрэнк Нтиликина",
    "Rui Hachimura": "Руи Хатимура", "Yuta Watanabe": "Юта Ватанабэ",
    "Kyle Anderson": "Кайл Андерсон", "Dante Exum": "Данте Эксум",
    "Josh Giddey": "Джош Гидди", "Ben Simmons": "Бен Симмонс",
    "Joe Ingles": "Джо Инглс", "Patrick Mills": "Патти Миллс",
    "Andrew Bogut": "Эндрю Богут", "Kirk Hinrich": "Кирк Хайнрик",
    "Dirk Nowitzki ": "Дирк Новицки", "Leandro Barbosa": "Леандро Барбоза",
    "Tiago Splitter": "Тьяго Сплиттер", "Raul Neto": "Рауль Нето",
    "Raulzinho Neto": "Рауль Нето", "Marcelo Huertas": "Марсело Уэртас",
    "Al Jefferson": "Эл Джефферсон", "Zach LaVine": "Зак Лавин",
    "Zach Randolph": "Зак Рэндольф", "Chris Mullin": "Крис Маллин",
    "Mitch Richmond": "Митч Ричмонд", "Spencer Haywood": "Спенсер Хейвуд",
    "Connie Hawkins": "Конни Хокинс", "Artis Gilmore": "Артис Гилмор",
    "Dan Issel": "Дэн Иссел", "Billy Cunningham": "Билли Каннингем",
    "Dave Cowens": "Дэйв Коуэнс", "Wes Unseld": "Уэс Анселд",
    "Earl Monroe": "Эрл Монро", "Dave Bing": "Дэйв Бинг",
    "Nate Archibald": "Нейт Арчибальд", "Bob McAdoo": "Боб Макаду",
    "Bernard King": "Бернард Кинг", "Alex English": "Алекс Инглиш",
    "Adrian Dantley": "Адриан Дэнтли", "Kiki Vandeweghe": "Кики Вандевеге",
    "Tom Chambers": "Том Чемберс", "Jack Sikma": "Джек Сикма",
    "Buck Williams ": "Бак Уильямс", "James Worthy": "Джеймс Уорти",
    "Byron Scott": "Байрон Скотт", "Michael Cooper": "Майкл Купер",
    "Dennis Rodman": "Деннис Родман", "Joe Dumars": "Джо Дюмарс",
    "Bill Laimbeer": "Билл Лэймбир", "Vinnie Johnson": "Винни Джонсон",
    "Kevin McHale": "Кевин Макхейл", "Danny Ainge": "Дэнни Эйндж",
    "Dale Davis": "Дейл Дэвис", "Antonio Davis": "Антонио Дэвис",
    "Rik Smits ": "Рик Смитс", "Mark Eaton": "Марк Итон",
    "Jeff Hornacek": "Джефф Хорначек", "Tyrone Hill": "Тайрон Хилл",
    "Latrell Sprewell": "Латрелл Спрюэлл", "Tom Gugliotta": "Том Гульотта",
    "Vin Baker": "Вин Бейкер", "Glenn Robinson": "Гленн Робинсон",
    "Juwan Howard": "Джуван Ховард", "Antonio McDyess": "Антонио Макдайс",
    "Stephon Marbury": "Стефон Марбери", "Steve Francis": "Стив Фрэнсис",
    "Baron Davis": "Бэрон Дэвис", "Antawn Jamison": "Антуан Джеймисон",
    "Lamar Odom": "Ламар Одом", "Michael Redd": "Майкл Редд",
    "Richard Jefferson": "Ричард Джефферсон", "Caron Butler": "Кэрон Батлер",
    "Gerald Wallace": "Джеральд Уоллес", "Josh Smith": "Джош Смит",
    "Andre Drummond": "Андре Драммонд", "Hassan Whiteside": "Хассан Уайтсайд",
    "Clint Capela": "Клинт Капела", "Rudy Gobert": "Руди Гобер",
    "Myles Turner": "Майлз Тёрнер", "Jarrett Allen": "Джарретт Аллен",
    "Mikal Bridges": "Микал Бриджес", "Desmond Bane": "Десмонд Бэйн",
    "Darius Garland": "Дариус Гарленд", "LaMarcus Aldridge": "ЛаМаркус Олдридж",
    "John Wall": "Джон Уолл", "Bradley Beal": "Брэдли Бил",
    "DeMarre Carroll": "ДеМарре Кэрролл", "Khem Birch": "Кем Бёрч",
}

# --- 2. Распространённые имена ---
FIRST = {
    "Aaron": "Аарон", "Adam": "Адам", "Adrian": "Адриан", "Al": "Эл", "Alex": "Алекс",
    "Allan": "Аллан", "Allen": "Аллен", "Alonzo": "Алонзо", "Alvin": "Элвин",
    "Andre": "Андре", "Andrew": "Эндрю", "Andy": "Энди", "Anthony": "Энтони",
    "Antoine": "Антуан", "Antonio": "Антонио", "Arnie": "Арни", "Art": "Арт",
    "Austin": "Остин", "Avery": "Эйвери", "Ben": "Бен", "Bernard": "Бернард",
    "Bill": "Билл", "Billy": "Билли", "Blake": "Блейк", "Bob": "Боб",
    "Bobby": "Бобби", "Brad": "Брэд", "Brandon": "Брэндон", "Brent": "Брент",
    "Brian": "Брайан", "Brook": "Брук", "Bruce": "Брюс", "Bryant": "Брайант",
    "Buck": "Бак", "Byron": "Байрон", "Caleb": "Калеб", "Calvin": "Кэлвин",
    "Cam": "Кэм", "Cameron": "Камерон", "Carl": "Карл", "Cedric": "Седрик",
    "Charles": "Чарльз", "Charlie": "Чарли", "Chase": "Чейз", "Chris": "Крис",
    "Christian": "Кристиан", "Chuck": "Чак", "Clarence": "Кларенс", "Cliff": "Клифф",
    "Clifford": "Клиффорд", "Clint": "Клинт", "Clyde": "Клайд", "Cole": "Коул",
    "Corey": "Кори", "Cory": "Кори", "Craig": "Крейг", "Dale": "Дейл",
    "Damon": "Деймон", "Dan": "Дэн", "Dana": "Дана", "Daniel": "Дэниел",
    "Danny": "Дэнни", "Darius": "Дариус", "Darrell": "Даррелл", "Darryl": "Дэррил",
    "Dave": "Дэйв", "David": "Дэвид", "Dean": "Дин", "Dee": "Ди",
    "Dell": "Делл", "Dennis": "Деннис", "Deron": "Дерон", "Derek": "Дерек",
    "Derrick": "Деррик", "Desmond": "Десмонд", "Devin": "Девин", "Dick": "Дик",
    "Dominique": "Доминик", "Don": "Дон", "Donald": "Дональд", "Doug": "Даг",
    "Drew": "Дрю", "Duane": "Дуэйн", "Dwayne": "Дуэйн", "Dwight": "Дуайт",
    "Earl": "Эрл", "Ed": "Эд", "Eddie": "Эдди", "Eddy": "Эдди",
    "Eli": "Илай", "Elliot": "Эллиот", "Elton": "Элтон", "Elvin": "Элвин",
    "Eric": "Эрик", "Erick": "Эрик", "Ernie": "Эрни", "Evan": "Эван",
    "Felipe": "Фелипе", "Felton": "Фелтон", "Floyd": "Флойд", "Francis": "Фрэнсис",
    "Frank": "Фрэнк", "Fred": "Фред", "Gail": "Гейл", "Gary": "Гэри",
    "Gene": "Джин", "George": "Джордж", "Gerald": "Джеральд", "Glen": "Глен",
    "Glenn": "Гленн", "Gordon": "Гордон", "Grant": "Грант", "Greg": "Грег",
    "Gus": "Гас", "Guy": "Гай", "Hank": "Хэнк", "Harold": "Гарольд",
    "Harry": "Гарри", "Henry": "Генри", "Herb": "Херб", "Horace": "Хорас",
    "Howard": "Ховард", "Hubert": "Хьюберт", "Isaac": "Айзек", "Isaiah": "Айзея",
    "Ivan": "Иван", "Jack": "Джек", "Jake": "Джейк", "Jalen": "Джейлен",
    "Jamaal": "Джамал", "Jamal": "Джамал", "James": "Джеймс", "Jared": "Джаред",
    "Jason": "Джейсон", "Jay": "Джей", "Jeff": "Джефф", "Jeremy": "Джереми",
    "Jerome": "Джером", "Jerry": "Джерри", "Jim": "Джим", "Jimmy": "Джимми",
    "Joe": "Джо", "Joel": "Джоэл", "John": "Джон", "Johnny": "Джонни",
    "Jon": "Джон", "Jordan": "Джордан", "Josh": "Джош", "Juan": "Хуан",
    "Julian": "Джулиан", "Julius": "Джулиус", "Justin": "Джастин", "Karl": "Карл",
    "Keith": "Кит", "Kelly": "Келли", "Ken": "Кен", "Kenny": "Кенни",
    "Kent": "Кент", "Kevin": "Кевин", "Kiki": "Кики", "Kirk": "Кирк",
    "Kris": "Крис", "Kurt": "Курт", "Kyle": "Кайл", "Lamar": "Ламар",
    "Larry": "Ларри", "Lee": "Ли", "Leon": "Леон", "Lewis": "Льюис",
    "Lionel": "Лайонел", "Lloyd": "Ллойд", "Lonnie": "Лонни", "Lou": "Лу",
    "Louis": "Луис", "Lucas": "Лукас", "Luke": "Люк", "Malcolm": "Малкольм",
    "Malik": "Малик", "Marc": "Марк", "Marcus": "Маркус", "Mark": "Марк",
    "Martin": "Мартин", "Marvin": "Марвин", "Matt": "Мэтт", "Maurice": "Морис",
    "Max": "Макс", "Melvin": "Мелвин", "Michael": "Майкл", "Mickey": "Микки",
    "Mike": "Майк", "Miles": "Майлз", "Mitch": "Митч", "Monte": "Монте",
    "Morris": "Моррис", "Moses": "Мозес", "Murray": "Мюррей", "Mychal": "Майкл",
    "Nate": "Нейт", "Nathan": "Нейтан", "Nick": "Ник", "Noah": "Ноа",
    "Norm": "Норм", "Norman": "Норман", "Oscar": "Оскар", "Otis": "Отис",
    "Pat": "Пэт", "Patrick": "Патрик", "Paul": "Пол", "Percy": "Перси",
    "Pete": "Пит", "Peter": "Питер", "Phil": "Фил", "Quinn": "Куинн",
    "Ralph": "Ральф", "Randy": "Рэнди", "Ray": "Рэй", "Reggie": "Реджи",
    "Rex": "Рекс", "Rich": "Рич", "Richard": "Ричард", "Rick": "Рик",
    "Ricky": "Рики", "Rob": "Роб", "Robert": "Роберт", "Rod": "Род",
    "Rodney": "Родни", "Roger": "Роджер", "Ron": "Рон", "Ronnie": "Ронни",
    "Rory": "Рори", "Roy": "Рой", "Rudy": "Руди", "Russ": "Расс",
    "Russell": "Расселл", "Ryan": "Райан", "Sam": "Сэм", "Sammy": "Сэмми",
    "Scott": "Скотт", "Scottie": "Скотти", "Sean": "Шон", "Shaun": "Шон",
    "Shawn": "Шон", "Sidney": "Сидни", "Stephen": "Стивен", "Steve": "Стив",
    "Steven": "Стивен", "Stuart": "Стюарт", "Terrell": "Террелл", "Terrence": "Терренс",
    "Terry": "Терри", "Theo": "Тео", "Tim": "Тим", "Todd": "Тодд",
    "Tom": "Том", "Tony": "Тони", "Tracy": "Трэйси", "Travis": "Трэвис",
    "Tre": "Тре", "Trevor": "Тревор", "Ty": "Тай", "Tyler": "Тайлер",
    "Tyrone": "Тайрон", "Victor": "Виктор", "Vince": "Винс", "Wally": "Уолли",
    "Walt": "Уолт", "Walter": "Уолтер", "Wayne": "Уэйн", "Wes": "Уэс",
    "Will": "Уилл", "Willie": "Уилли", "Zach": "Зак", "Zion": "Зайон",
    "Luka": "Лука", "Nikola": "Никола", "Goran": "Горан", "Bogdan": "Богдан",
    "Dario": "Дарио", "Jusuf": "Юсуф", "Boban": "Бобан", "Dragan": "Драган",
    "Vlade": "Владе", "Zoran": "Зоран", "Toni": "Тони", "Mario": "Марио",
    "Jonas": "Йонас", "Mindaugas": "Миндаугас", "Sarunas": "Шарунас",
}

# --- 3. Практическая транскрипция (приближённая) ---
_MULTI = [
    ("shch", "щ"), ("eigh", "ей"), ("ough", "о"), ("augh", "о"),
    ("tch", "ч"), ("sch", "ш"), ("igh", "ай"), ("mac", "мак"), ("mc", "мак"),
    ("ck", "к"), ("ch", "ч"), ("sh", "ш"), ("th", "т"), ("ph", "ф"),
    ("wh", "у"), ("gh", "г"), ("qu", "кв"), ("kn", "н"), ("wr", "р"),
    ("oo", "у"), ("ee", "и"), ("ea", "и"), ("ie", "и"), ("ei", "ей"),
    ("ey", "и"), ("ay", "ей"), ("ai", "ей"), ("au", "о"), ("aw", "о"),
    ("ow", "оу"), ("ou", "у"), ("oy", "ой"), ("oi", "ой"), ("ya", "я"),
    ("yo", "йо"), ("yu", "ю"), ("ye", "е"),
]
_SINGLE = {
    "a": "а", "b": "б", "c": "к", "d": "д", "e": "е", "f": "ф", "g": "г",
    "h": "х", "i": "и", "j": "дж", "k": "к", "l": "л", "m": "м", "n": "н",
    "o": "о", "p": "п", "q": "к", "r": "р", "s": "с", "t": "т", "u": "а",
    "v": "в", "w": "у", "x": "кс", "y": "и", "z": "з", "'": "'",
}
_SOFT = {"e", "i", "y"}  # c→с, g→дж перед мягкими

_DIA = {
    "ć": "ч", "č": "ч", "š": "ш", "ž": "ж", "đ": "дж", "ş": "ш", "ğ": "г",
    "ñ": "нь", "ņ": "нь", "ļ": "ль", "ģ": "г", "ī": "и", "ā": "а", "ē": "е",
    "ū": "у", "ė": "е", "ų": "у", "İ": "и",
}


def _translit_word(word: str) -> str:
    """Одно слово латиницей → приближённая русская транскрипция."""
    # диакритика: смысловые замены, остальное — в базовую латиницу
    w = "".join(_DIA.get(ch, ch) for ch in word)
    w = "".join(
        c for c in unicodedata.normalize("NFKD", w) if not unicodedata.combining(c)
    )
    src = w.lower()
    out, i = [], 0
    while i < len(src):
        ch = src[i]
        if not ch.isascii():  # уже кириллица из _DIA
            out.append(ch)
            i += 1
            continue
        matched = False
        for pat, rep in _MULTI:
            if src.startswith(pat, i) and (pat not in ("mc", "mac") or i == 0):
                out.append(rep)
                i += len(pat)
                matched = True
                break
        if matched:
            continue
        if ch == "c" and i + 1 < len(src) and src[i + 1] in _SOFT:
            out.append("с")
        elif ch == "g" and i + 1 < len(src) and src[i + 1] in _SOFT:
            out.append("дж")
        elif ch == "e" and i == len(src) - 1 and len(src) > 3 and src[i - 1] not in "aeiou":
            pass  # немое конечное e
        elif ch == "y" and i == 0 and i + 1 < len(src) and src[i + 1] in "aeiou":
            out.append("й")
        elif ch == "w" and i == 0:
            out.append("у")
        else:
            out.append(_SINGLE.get(ch, ch))
        i += 1
    res = "".join(out)
    return res[:1].upper() + res[1:] if res else res


def _translit_token(token: str) -> str:
    """Токен с дефисами/апострофами: части транскрибируются отдельно."""
    if token in ("Jr.", "Jr"):
        return "мл."
    if re.fullmatch(r"[IVX]+", token):
        return token  # римские суффиксы
    parts = re.split(r"(-)", token)
    return "".join(p if p == "-" else _translit_word(p) for p in parts)


def ru_name(name: str) -> str:
    """Полное имя → русское написание (FULL → FIRST+транскрипция)."""
    if name in FULL:
        return FULL[name]
    tokens = name.split()
    out = []
    for i, t in enumerate(tokens):
        if i == 0 and t in FIRST:
            out.append(FIRST[t])
        else:
            out.append(_translit_token(t))
    return " ".join(out)
