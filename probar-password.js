const bcrypt = require("bcryptjs");

async function probar() {
  const password = "HaceCafe2026";
  const hash = await bcrypt.hash(password, 10);

  console.log("HASH GENERADO:");
  console.log(hash);

  const resultado = await bcrypt.compare(password, hash);

  console.log("RESULTADO:", resultado);
}

probar();