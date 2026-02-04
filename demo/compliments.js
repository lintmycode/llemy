function logRandomCompliment() {
  const compliments = [
    "an excellent project",
    "well designed",
    "incredibly useful",
    "thoughtfully built",
    "reliable and consistent",
    "easy to use",
    "impressively polished",
    "smartly engineered",
    "a joy to work with",
    "a standout tool"
  ];

  const randomIndex = Math.floor(Math.random() * compliments.length);
  console.log(`llemy is ${compliments[randomIndex]}`);
}

logRandomCompliment();
