// Contact — contact/intake destination. The form POSTs to the
// /api/contact Pages Function, which forwards submissions to the lab
// inbox via Resend. Copy and field definitions live here so
// the form is data-driven rather than hardcoded in JSX.
//
// The exported object remains named `transmission` internally for
// compatibility with the existing React component. The public site
// IA is now CONTACT.
export const transmission = {
  sectionIndex: "CONTACT",
  heading: "GET A FREE\nQUOTE.",
  body:
    "Tell me what you're trying to build — I'll reply within 24 hours with an honest quote, even if we don't end up working together.",
  // Dual path: form + book-a-call. The call band only renders when a
  // scheduling URL is set (Joshua's call, 2026-09-30 — he wants Zoom
  // booking as the parallel path to the form).
  booking: {
    url: "https://calendly.com/joshuaalmodovar/30min",
    prompt: "Prefer to talk it through?",
    label: "BOOK A 30-MIN INTRO CALL",
  },
  // "What happens next" — answers the post-send fear before the ask.
  next: {
    sectionIndex: "WHAT HAPPENS NEXT",
    steps: [
      {
        num: "01",
        title: "SEND THE BRIEF",
        body: "Tell me what you're trying to build and what “working” looks like.",
      },
      {
        num: "02",
        title: "GET AN HONEST QUOTE",
        body: "I reply within 24 hours — a straight answer, not a sales pitch.",
      },
      {
        num: "03",
        title: "SCOPE IT ON ONE CALL",
        body: "If it's a fit, we lock the plan down on a single call.",
      },
    ],
  },
  fields: [
    {
      id: "transmission-name",
      name: "name",
      label: "NAME",
      type: "text",
      required: true,
      autoComplete: "name",
    },
    {
      id: "transmission-company",
      name: "company",
      label: "COMPANY / PROJECT",
      type: "text",
      required: false,
      autoComplete: "organization",
    },
    {
      id: "transmission-email",
      name: "email",
      label: "EMAIL",
      type: "email",
      required: true,
      autoComplete: "email",
    },
    {
      id: "transmission-subject",
      name: "subject",
      label: "WHAT IS THIS ABOUT?",
      type: "select",
      required: true,
      options: [
        {
          value: "project",
          label: "PROJECT",
        },
        {
          value: "collaboration",
          label: "COLLABORATION",
        },
        {
          value: "tower-of-babel",
          label: "TOWER OF BABEL",
        },
        {
          value: "government",
          label: "GOV CONTRACTS",
        },
        {
          value: "general",
          label: "GENERAL",
        },
        {
          value: "question",
          label: "QUESTION",
        },
        {
          value: "just-saying-hello",
          label: "JUST SAYING HELLO",
        },
      ],
    },
    {
      id: "transmission-message",
      name: "message",
      label: "MESSAGE",
      type: "textarea",
      required: true,
      rows: 6,
    },
  ],
  submit: {
    label: "SEND MESSAGE",
    ariaLabel: "Send message",
  },
  // Below the form: sets the expectation that a human reads it.
  // 24-hour SLA sits at the ask (submit button), not below the fold.
  noBackendNotice:
    "Your message goes straight to the lab inbox — I read everything myself and reply within 24 hours.",
  success: {
    heading: "MESSAGE SENT.",
    body: "Your message is on its way to the lab.",
    note: "I read everything myself and reply within 24 hours — usually much sooner.",
  },
  // NOTE 2026-09-30: the direct-contact strip (facts, elsewhere links,
  // good-first-message note) was removed from the page per Joshua's call.
  // The email remains the Resend fallback in the form error message.
};