const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

export function isAffirmativeCallClosure(value: string) {
  const text = normalize(value);
  if (!text) return false;
  if (/\b(but|however|although|when|where|why|how|what|which|another|also)\b/.test(text)) return false;
  return /^(oh\s+)?(yes|yeah|yep|yup|sure|correct|absolutely)(\s+(thanks|thank\s+you))?$/.test(text)
    || /^(thanks|thank\s+you|thanks\s+so\s+much|thank\s+you\s+so\s+much|that\s+is\s+all|that\s+s\s+all|all\s+good|perfect|got\s+it|problem\s+solved|resolved|bye|goodbye)$/i.test(text)
    || /\b(that|it)\s+(resolved|solved|answers)\b/.test(text);
}
