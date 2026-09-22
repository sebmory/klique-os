var PARTNER_RESPONSES_SHEET = "Forms_Partenaires_Responses";
var SYNC_URL_PROPERTY = "PARTNER_APPLICATION_SYNC_URL";
var SYNC_SECRET_PROPERTY = "PARTNER_APPLICATION_SYNC_HMAC_SECRET";

function onFormSubmit(event) {
  if (!event || !event.range) {
    throw new Error("Événement onFormSubmit invalide.");
  }

  var sheet = event.range.getSheet();
  if (sheet.getName() !== PARTNER_RESPONSES_SHEET) {
    throw new Error("Le déclencheur doit cibler Forms_Partenaires_Responses.");
  }

  var rowNumber = event.range.getRow();
  if (!Number.isInteger(rowNumber) || rowNumber < 2) {
    throw new Error("Numéro de ligne soumis invalide.");
  }

  var properties = PropertiesService.getScriptProperties();
  var apiUrl = String(properties.getProperty(SYNC_URL_PROPERTY) || "").trim();
  var secret = String(properties.getProperty(SYNC_SECRET_PROPERTY) || "").trim();
  if (!apiUrl || secret.length < 32) {
    throw new Error("Configuration de synchronisation incomplète.");
  }

  var timestamp = String(Math.floor(Date.now() / 1000));
  var rawBody = JSON.stringify({ rowNumber: rowNumber });
  var signature = createPartnerSyncSignature_(timestamp, rawBody, secret);
  var response = UrlFetchApp.fetch(apiUrl, {
    method: "post",
    contentType: "application/json",
    payload: rawBody,
    headers: {
      "x-klique-timestamp": timestamp,
      "x-klique-signature": signature,
    },
    muteHttpExceptions: true,
  });
  var statusCode = response.getResponseCode();

  console.log("Partner sync row=%s status=%s", rowNumber, statusCode);
  if (statusCode < 200 || statusCode >= 300) {
    throw new Error("La synchronisation Partenaire a échoué avec le statut HTTP " + statusCode + ".");
  }
}

function createPartnerSyncSignature_(timestamp, rawBody, secret) {
  var bytes = Utilities.computeHmacSha256Signature(
    timestamp + "." + rawBody,
    secret,
    Utilities.Charset.UTF_8
  );
  var hex = bytes.map(function (value) {
    return (value & 255).toString(16).padStart(2, "0");
  }).join("");
  return "sha256=" + hex;
}