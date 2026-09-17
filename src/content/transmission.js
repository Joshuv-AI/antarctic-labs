// Transmission — contact/intake destination. Front-end form only;
// no backend integration yet. Copy and field definitions live here so
// the form is data-driven rather than hardcoded in JSX.

export const transmission = {
  sectionIndex: "09 / TRANSMISSION",
  heading: "HAVE A PROBLEM\nWORTH SOLVING?",
  body:
    "Have an idea, need a system built, want to collaborate, or simply found something interesting? Send a transmission.",

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
        { value: "project",         label: "PROJECT" },
        { value: "collaboration",   label: "COLLABORATION" },
        { value: "tower-of-babel",  label: "TOWER OF BABEL" },
        { value: "government",      label: "GOVERNMENT / PUBLIC SECTOR" },
        { value: "general",         label: "GENERAL" },
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
    {
      id: "transmission-website",
      name: "website",
      label: "WEBSITE",
      type: "text",
      required: false,
      placeholder: "Leave blank if not applicable",
    },
  ],

  submit: {
    label: "SEND TRANSMISSION",
    ariaLabel: "Send transmission",
  },

  // No backend. The form does NOT transmit to a server. The success
  // state is purely client-side acknowledgement that the local form
  // was filled out. We never claim a server received the message.
  noBackendNotice:
    "Front-end form only. Submissions are not currently transmitted to a server. Use the mailto link below to reach Antarctic Labs directly.",

  success: {
    heading: "TRANSMISSION RECEIVED.",
    body: "I’ll review your message and respond directly.",
    note: "Confirmation is local to this browser — nothing was sent over the network. Use the mailto link to ensure delivery.",
  },
};
