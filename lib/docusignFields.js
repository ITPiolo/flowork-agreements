// Field maps for turning static Flowork templates into fillable DocuSign envelopes.
// Each entry becomes a hidden anchor injected into the rendered PDF; lib/pdf.js measures the
// real on-page geometry (the blank line under a text label, or the checkbox glyph next to a
// Yes/No option) to work out where the fillable box should sit, so no offsets are guessed here.

function textField(id, pattern, tabLabel, { occurrence = 0, required = false } = {}) {
  return { id, pattern, occurrence, tab: { type: 'text', tabLabel, required } };
}

// Independent checkbox — used where more than one option can be true at once (e.g. "purpose of
// transaction" or the documents-attached checklist), unlike the Yes/No questions below.
function checkbox(id, pattern, tabLabel, { occurrence = 0 } = {}) {
  return { id, pattern, occurrence, tab: { type: 'checkbox', tabLabel } };
}

// A single Yes/No question modeled as a DocuSign radio group (mutually exclusive by
// construction) rather than two independent checkboxes.
function yesNoQuestion(groupName, yesId, noId, occurrence) {
  return [
    { id: yesId, pattern: '^Yes$', occurrence, tab: { type: 'radio', groupName, value: 'yes' } },
    { id: noId, pattern: '^No$', occurrence, tab: { type: 'radio', groupName, value: 'no' } },
  ];
}

// House Rules: no data entry, just a signature block.
export const HOUSE_RULES_FIELDS = [
  { id: '/sig/', pattern: '^Signature', occurrence: 0, tab: { type: 'sign' } },
];

// KYC: everything the client needs to fill in. Deliberately excludes the "FOR FLOWORK
// BUSINESS CENTER USE ONLY" block (Verified By / Verification Date / Staff Name / Staff
// Position / Staff Signature) — that section is filled by Flowork staff after review, not
// sent to the client as part of this envelope.
export const KYC_FIELDS = [
  // Section 1 — General Information
  textField('company_name', '^FULL COMPANY NAME', 'Full Company Name', { required: true }),
  textField('office_no', 'OFFICE NO', 'Office No.'),
  textField('building_name', '^BUILDING NAME', 'Building Name'),
  textField('street_address', '^STREET ADDRESS', 'Street Address'),
  textField('city', '^CITY:?$', 'City'),
  textField('state', '^STATE:?$', 'State'),
  textField('country', '^COUNTRY:?$', 'Country'),
  textField('pin_zip', 'PIN.*ZIP.*CODE', 'PIN/ZIP/P.O. Box'),
  textField('telephone', 'TELEPHONE.*MOBILE', 'Telephone/Mobile No.'),
  textField('company_email', '^EMAIL ADDRESS', 'Company Email', { occurrence: 0, required: true }),

  // Trade/Commercial License Details
  textField('issuing_authority', '^ISSUING AUTHORITY', 'Issuing Authority'),
  textField('license_no', '^LICENSE NO', 'License No.'),
  textField('issue_date', '^ISSUE DATE', 'Issue Date'),
  textField('expiry_date', '^EXPIRY DATE', 'Expiry Date'),
  textField('other_registration_status', 'OTHER REGISTRATION STATUS', 'Other Registration Status'),

  // Section 2 — Ownership & Regulatory Information
  textField('owner_full_name', '^FULL NAME', 'Owner Full Name', { required: true }),
  textField('owner_nationality', '^NATIONALITY', 'Nationality'),
  textField('owner_contact_no', '^CONTACT NO', 'Owner Contact No.'),
  textField('owner_email', '^EMAIL ADDRESS', 'Owner Email', { occurrence: 1 }),
  textField('source_of_funds', 'SOURCE OF FUNDS', 'Source of Funds'),

  // Purpose of transaction — more than one can apply, so independent checkboxes (not radios).
  checkbox('purpose_business_proceeds', '^BUSINESS PROCEEDS', 'Business Proceeds'),
  checkbox('purpose_inheritance', '^INHERITANCE', 'Inheritance'),
  checkbox('purpose_others', '^OTHERS', 'Other Purpose'),

  // PEP declaration — Yes/No, mutually exclusive.
  ...yesNoQuestion('pep_declaration', 'pep_yes', 'pep_no', 0),
  textField('pep_name', '^NAME:?$', 'PEP Name', { occurrence: 0 }),
  textField('pep_relationship', '^RELATIONSHIP', 'PEP Relationship'),
  textField('pep_title', '^TITLE:?$', 'PEP Title'),

  // Group company
  textField('group_company_name', 'NAME OF COMPANY', 'Group Company Name'),
  textField('group_company_nature', 'NATURE OF ASSOCIATION', 'Nature of Association'),

  // Ultimate Beneficial Owner
  textField('ubo_name', 'NAME OF THE PERSON', 'UBO Name'),
  textField('ubo_share_pct', 'SHARE %', 'UBO Share %'),
  textField('ubo_identity_no', 'IDENTITY NO', 'UBO Identity No.'),
  textField('ubo_id_type', 'ID TYPE', 'UBO ID Type'),

  // Section 3 — Compliance questions (6 Yes/No pairs, in document order), each a radio group.
  ...yesNoQuestion('compliance_1', 'compliance_1_yes', 'compliance_1_no', 1),
  ...yesNoQuestion('compliance_2', 'compliance_2_yes', 'compliance_2_no', 2),
  ...yesNoQuestion('compliance_3', 'compliance_3_yes', 'compliance_3_no', 3),
  ...yesNoQuestion('compliance_4', 'compliance_4_yes', 'compliance_4_no', 4),
  ...yesNoQuestion('compliance_5', 'compliance_5_yes', 'compliance_5_no', 5),
  ...yesNoQuestion('compliance_6', 'compliance_6_yes', 'compliance_6_no', 6),
  textField('compliance_specify', 'IF YES .*PLEASE SPECIFY', 'If Yes, Please Specify'),

  // Documents attached checklist (checkbox glyph precedes each label)
  checkbox('doc_trade_license', '^Trade License copy', 'Doc: Trade License'),
  checkbox('doc_moa_aoa', '^MOA and AOA', 'Doc: MOA/AOA'),
  checkbox('doc_share_certificate', '^Share Certificate', 'Doc: Share Certificate'),
  checkbox('doc_business_reg', '^Business Registration Certificate', 'Doc: Business Registration'),
  checkbox('doc_vat_reg', '^VAT Registration Certificate', 'Doc: VAT Registration'),
  checkbox('doc_tax_reg', '^Corporate TAX Registration Certificate', 'Doc: Tax Registration'),
  checkbox('doc_cert_registration', '^Certificate of Registration', 'Doc: Certificate of Registration'),
  checkbox('doc_extract_company', '^Extract of Company', 'Doc: Extract of Company'),
  checkbox('doc_passport', '^Passport$', 'Doc: Passport'),
  checkbox('doc_visa', '^Visa', 'Doc: Visa'),
  checkbox('doc_emirates_id', '^Emirates ID', 'Doc: Emirates ID'),
  checkbox('doc_other_id', '^Other ID', 'Doc: Other ID'),

  // Client signature block (page 4) — excludes the staff-only verification block below it.
  textField('signer_name', '^NAME:?$', 'Signer Name', { occurrence: 1, required: true }),
  textField('signer_position', '^POSITION$', 'Signer Position', { occurrence: 0 }),
  textField('signer_date', '^DATE$', 'Date', { occurrence: 0 }),
  { id: '/sig/', pattern: '^SIGNATURE$', occurrence: 0, tab: { type: 'sign' } },
];

export function getFieldsForDocType(docType) {
  if (docType === 'kyc') return KYC_FIELDS;
  return HOUSE_RULES_FIELDS;
}

// Builds the DocuSign tabs object (signHereTabs/textTabs/checkboxTabs/radioGroupTabs) for a
// signer from a field list and the measured pixel placements lib/pdf.js returned for it.
export function buildSignerTabs(fields, placements) {
  const placementById = new Map(placements.map((p) => [p.id, p]));
  const signHereTabs = [];
  const textTabs = [];
  const checkboxTabs = [];
  const radioGroups = new Map(); // groupName -> radios[]

  for (const field of fields) {
    const placement = placementById.get(field.id);
    if (!placement) continue;

    const base = {
      anchorString: field.id,
      anchorUnits: 'pixels',
      anchorXOffset: String(placement.xOffset),
      anchorYOffset: String(placement.yOffset),
      anchorIgnoreIfNotPresent: 'false',
    };

    if (field.tab.type === 'sign') {
      signHereTabs.push(base);
    } else if (field.tab.type === 'text') {
      textTabs.push({
        ...base,
        tabLabel: field.tab.tabLabel,
        width: String(placement.width),
        height: String(placement.height),
        required: String(!!field.tab.required),
      });
    } else if (field.tab.type === 'checkbox') {
      checkboxTabs.push({ ...base, tabLabel: field.tab.tabLabel, selected: 'false' });
    } else if (field.tab.type === 'radio') {
      const radios = radioGroups.get(field.tab.groupName) ?? [];
      radios.push({ ...base, value: field.tab.value });
      radioGroups.set(field.tab.groupName, radios);
    }
  }

  const radioGroupTabs = Array.from(radioGroups.entries()).map(([groupName, radios]) => ({
    groupName,
    radios,
  }));

  return { signHereTabs, textTabs, checkboxTabs, radioGroupTabs };
}
