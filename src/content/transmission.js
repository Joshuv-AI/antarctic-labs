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
    label: "SEND MESSAGE",
    ariaLabel: "Send message",
  },
  // No backend. The form does NOT transmit to a server.
  // The success state is purely client-side acknowledgement.
  noBackendNotice:
    "Front-end form only. Submissions are not currently transmitted to a server. Use the mailto link below to reach Antarctic Labs directly.",
  success: {
    heading: "MESSAGE READY.",
    body: "Your information has been entered and is ready for review.",
    note: "Confirmation is local to this browser — nothing was sent over the network. Use the mailto link to ensure delivery.",
  },
};