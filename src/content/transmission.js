// Contact — contact/intake destination. Front-end form only;
// no backend integration yet. Copy and field definitions live here so
// the form is data-driven rather than hardcoded in JSX.
//
// The exported object remains named `transmission` internally for
// compatibility with the existing React component. The public site
// IA is now CONTACT.
export const transmission = {
  sectionIndex: "09 / CONTACT",
  heading: "HAVE A PROBLEM\nWORTH SOLVING?",
  body:
    "Have an idea, need a system built, want to collaborate, or simply found something interesting? Get in touch.",
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
  // No backend. The form does NOT transmit to a server.
  // The success state is purely client-side acknowledgement.
  noBackendNotice:
    "This form doesn't send anywhere yet — it will be wired up soon. The direct email link is the reliable way to reach Antarctic Labs for now.",
  success: {
    heading: "MESSAGE READY.",
    body: "Your information has been entered and is ready for review.",
    note: "Confirmation is local to this browser — nothing was sent over the network. Use the direct email link to ensure delivery.",
  },
  // Direct-contact panel: the channel that works today.
  direct: {
    facts: [
      ["RESPONSE", "I read everything myself and reply within 48 hours — usually much sooner."],
      ["BASED", "Sanford, Florida — working worldwide."],
      ["BEST FOR", "AI automation, data systems, and web builds."],
    ],
    elsewhere: [
      { label: "GitHub", href: "https://github.com/Joshuv-AI" },
    ],
    note: "A good first message says what you're trying to build, what “working” looks like, and roughly when you need it.",
  },
};