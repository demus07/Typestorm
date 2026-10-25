// Public-domain quotes and passages. Length groups follow character count:
// short <= 100, medium <= 300, long <= 600, thicc > 600.
const RAW = [
  ["The only thing we have to fear is fear itself.", "Franklin D. Roosevelt"],
  ["The unexamined life is not worth living.", "Socrates"],
  ["Brevity is the soul of wit.", "William Shakespeare, Hamlet"],
  ["All that glitters is not gold.", "William Shakespeare, The Merchant of Venice"],
  ["Simplicity is the ultimate sophistication.", "Leonardo da Vinci"],
  ["Knowledge is power.", "Francis Bacon"],
  ["Fortune favors the bold.", "Virgil"],
  ["The journey of a thousand miles begins with one step.", "Lao Tzu"],
  ["Well done is better than well said.", "Benjamin Franklin"],
  ["An investment in knowledge pays the best interest.", "Benjamin Franklin"],
  ["Happy families are all alike; every unhappy family is unhappy in its own way.", "Leo Tolstoy, Anna Karenina"],
  ["When you have eliminated the impossible, whatever remains, however improbable, must be the truth.", "Arthur Conan Doyle, The Sign of the Four"],
  ["There is nothing more deceptive than an obvious fact.", "Arthur Conan Doyle, The Boscombe Valley Mystery"],
  ["Beware; for I am fearless, and therefore powerful.", "Mary Shelley, Frankenstein"],
  ["Nothing is so painful to the human mind as a great and sudden change.", "Mary Shelley, Frankenstein"],
  ["We are all in the gutter, but some of us are looking at the stars.", "Oscar Wilde, Lady Windermere's Fan"],
  ["To live is the rarest thing in the world. Most people exist, that is all.", "Oscar Wilde, The Soul of Man under Socialism"],
  ["Marley was dead: to begin with. There is no doubt whatever about that.", "Charles Dickens, A Christmas Carol"],
  ["The world is a book, and those who do not travel read only one page.", "Augustine of Hippo"],
  ["It is a truth universally acknowledged, that a single man in possession of a good fortune, must be in want of a wife.", "Jane Austen, Pride and Prejudice"],
  ["Two roads diverged in a wood, and I - I took the one less traveled by, and that has made all the difference.", "Robert Frost, The Road Not Taken"],
  ["To believe your own thought, to believe that what is true for you in your private heart is true for all men, - that is genius.", "Ralph Waldo Emerson, Self-Reliance"],
  ["'Would you tell me, please, which way I ought to go from here?' 'That depends a good deal on where you want to get to,' said the Cat.", "Lewis Carroll, Alice's Adventures in Wonderland"],
  ["In the beginning God created the heaven and the earth. And the earth was without form, and void; and darkness was upon the face of the deep.", "Genesis 1:1-2, King James Bible"],
  ["Four score and seven years ago our fathers brought forth on this continent, a new nation, conceived in Liberty, and dedicated to the proposition that all men are created equal.", "Abraham Lincoln, Gettysburg Address"],
  ["We hold these truths to be self-evident, that all men are created equal, that they are endowed by their Creator with certain unalienable Rights, that among these are Life, Liberty and the pursuit of Happiness.", "United States Declaration of Independence"],
  ["Begin the morning by saying to thyself, I shall meet with the busy-body, the ungrateful, arrogant, deceitful, envious, unsocial. All these things happen to them by reason of their ignorance of what is good and evil.", "Marcus Aurelius, Meditations"],
  ["Call me Ishmael. Some years ago - never mind how long precisely - having little or no money in my purse, and nothing particular to interest me on shore, I thought I would sail about a little and see the watery part of the world.", "Herman Melville, Moby-Dick"],
  ["To be, or not to be, that is the question: whether 'tis nobler in the mind to suffer the slings and arrows of outrageous fortune, or to take arms against a sea of troubles and by opposing end them. To die - to sleep, no more; and by a sleep to say we end the heart-ache and the thousand natural shocks that flesh is heir to: 'tis a consummation devoutly to be wish'd.", "William Shakespeare, Hamlet"],
  ["Tomorrow, and tomorrow, and tomorrow, creeps in this petty pace from day to day, to the last syllable of recorded time; and all our yesterdays have lighted fools the way to dusty death. Out, out, brief candle! Life's but a walking shadow, a poor player, that struts and frets his hour upon the stage, and then is heard no more. It is a tale told by an idiot, full of sound and fury, signifying nothing.", "William Shakespeare, Macbeth"],
  ["I went to the woods because I wished to live deliberately, to front only the essential facts of life, and see if I could not learn what it had to teach, and not, when I came to die, discover that I had not lived. I did not wish to live what was not life, living is so dear; nor did I wish to practise resignation, unless it was quite necessary.", "Henry David Thoreau, Walden"],
  ["When in the Course of human events, it becomes necessary for one people to dissolve the political bands which have connected them with another, and to assume among the powers of the earth, the separate and equal station to which the Laws of Nature and of Nature's God entitle them, a decent respect to the opinions of mankind requires that they should declare the causes which impel them to the separation.", "United States Declaration of Independence"],
  ["It was the best of times, it was the worst of times, it was the age of wisdom, it was the age of foolishness, it was the epoch of belief, it was the epoch of incredulity, it was the season of Light, it was the season of Darkness, it was the spring of hope, it was the winter of despair, we had everything before us, we had nothing before us, we were all going direct to Heaven, we were all going direct the other way - in short, the period was so far like the present period, that some of its noisiest authorities insisted on its being received, for good or for evil, in the superlative degree of comparison only.", "Charles Dickens, A Tale of Two Cities"],
  ["Call me Ishmael. Some years ago - never mind how long precisely - having little or no money in my purse, and nothing particular to interest me on shore, I thought I would sail about a little and see the watery part of the world. It is a way I have of driving off the spleen and regulating the circulation. Whenever I find myself growing grim about the mouth; whenever it is a damp, drizzly November in my soul; whenever I find myself involuntarily pausing before coffin warehouses, and bringing up the rear of every funeral I meet; and especially whenever my hypos get such an upper hand of me, that it requires a strong moral principle to prevent me from deliberately stepping into the street, and methodically knocking people's hats off - then, I account it high time to get to sea as soon as I can.", "Herman Melville, Moby-Dick"],
  ["Four score and seven years ago our fathers brought forth on this continent, a new nation, conceived in Liberty, and dedicated to the proposition that all men are created equal. Now we are engaged in a great civil war, testing whether that nation, or any nation so conceived and so dedicated, can long endure. We are met on a great battle-field of that war. We have come to dedicate a portion of that field, as a final resting place for those who here gave their lives that that nation might live. It is altogether fitting and proper that we should do this. But, in a larger sense, we can not dedicate - we can not consecrate - we can not hallow - this ground. The brave men, living and dead, who struggled here, have consecrated it, far above our poor power to add or detract. The world will little note, nor long remember what we say here, but it can never forget what they did here. It is for us the living, rather, to be dedicated here to the unfinished work which they who fought here have thus far so nobly advanced. It is rather for us to be here dedicated to the great task remaining before us - that from these honored dead we take increased devotion to that cause for which they gave the last full measure of devotion - that we here highly resolve that these dead shall not have died in vain - that this nation, under God, shall have a new birth of freedom - and that government of the people, by the people, for the people, shall not perish from the earth.", "Abraham Lincoln, Gettysburg Address"],
];

const groupOf = (len) => (len <= 100 ? "short" : len <= 300 ? "medium" : len <= 600 ? "long" : "thicc");

export const QUOTES = RAW.map(([text, source], i) => ({ id: i + 1, text, source, length: groupOf(text.length) }));
export const QUOTE_LENGTHS = ["all", "short", "medium", "long", "thicc"];

let lastId = null;
export function randomQuote(lengthGroup) {
  let pool = QUOTES.filter((q) => lengthGroup === "all" || q.length === lengthGroup);
  if (!pool.length) pool = QUOTES;
  if (pool.length > 1) pool = pool.filter((q) => q.id !== lastId);
  const quote = pool[Math.floor(Math.random() * pool.length)];
  lastId = quote.id;
  return quote;
}
