// Portal Pie Clinic: menú móvil y formulario SIMULADO (no envía datos a ningún lado).
(function () {
  var b = document.getElementById("burger"), m = document.getElementById("menu");
  if (b && m) {
    b.addEventListener("click", function () {
      var o = m.classList.toggle("open");
      b.setAttribute("aria-expanded", o ? "true" : "false");
    });
    m.addEventListener("click", function (e) {
      if (e.target.tagName === "A") { m.classList.remove("open"); b.setAttribute("aria-expanded", "false"); }
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && m.classList.contains("open")) { m.classList.remove("open"); b.setAttribute("aria-expanded", "false"); b.focus(); }
    });
  }
  var f = document.getElementById("cita-form");
  if (!f) return;
  function err(id, msg) {
    var el = document.getElementById(id), p = document.getElementById(id + "-e");
    el.setAttribute("aria-invalid", msg ? "true" : "false");
    p.textContent = msg || "";
    return !msg;
  }
  f.addEventListener("submit", function (e) {
    e.preventDefault();
    var nom = f.nombre.value.trim(), tel = f.tel.value.replace(/\D/g, ""), mail = f.correo.value.trim();
    var ok = [
      err("nombre", nom.length < 3 ? "Escribe tu nombre completo." : ""),
      err("tel", tel.length < 10 ? "Escribe un teléfono de 10 dígitos." : ""),
      err("correo", mail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail) ? "El correo no parece válido." : ""),
      err("servicio", !f.servicio.value ? "Elige un servicio." : ""),
      err("suc", !f.suc.value ? "Elige una sucursal." : "")
    ];
    if (ok.indexOf(false) >= 0) { f.querySelector("[aria-invalid=true]").focus(); return; }
    var r = document.getElementById("resultado");
    r.hidden = false;
    r.innerHTML = "";
    var p = document.createElement("p");
    p.innerHTML = "<strong>Gracias, " + nom.split(" ")[0].replace(/[<>&]/g, "") + ".</strong> Recibimos tu solicitud de cita (simulada). En el sitio real, recepción te confirmaría por WhatsApp o teléfono.";
    r.appendChild(p);
    r.focus();
    f.reset();
  });
})();
