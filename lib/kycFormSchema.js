// Drives the client-facing KYC web form. Field ids match lib/docusignFields.js's KYC_FIELDS
// exactly, so submitted values map straight onto renderFilledPdf without any translation.
export const KYC_FORM_SECTIONS = [
  {
    title: 'General Information',
    fields: [
      { id: 'company_name', label: 'Full Company Name', type: 'text', required: true },
      { id: 'office_no', label: 'Office No.', type: 'text' },
      { id: 'building_name', label: 'Building Name', type: 'text' },
      { id: 'street_address', label: 'Street Address', type: 'text' },
      { id: 'city', label: 'City', type: 'text' },
      { id: 'state', label: 'State', type: 'text' },
      { id: 'country', label: 'Country', type: 'text' },
      { id: 'pin_zip', label: 'PIN/ZIP/P.O. Box', type: 'text' },
      { id: 'telephone', label: 'Telephone/Mobile No.', type: 'text' },
      { id: 'company_email', label: 'Company Email', type: 'text', inputType: 'email', required: true },
    ],
  },
  {
    title: 'Trade/Commercial License Details',
    fields: [
      { id: 'issuing_authority', label: 'Issuing Authority', type: 'text' },
      { id: 'license_no', label: 'License No.', type: 'text' },
      { id: 'issue_date', label: 'Issue Date', type: 'text', inputType: 'date' },
      { id: 'expiry_date', label: 'Expiry Date', type: 'text', inputType: 'date' },
      { id: 'other_registration_status', label: 'Other Registration Status', type: 'text' },
    ],
  },
  {
    title: 'Ownership & Regulatory Information',
    fields: [
      { id: 'owner_full_name', label: 'Owner Full Name', type: 'text', required: true },
      { id: 'owner_nationality', label: 'Nationality', type: 'text' },
      { id: 'owner_contact_no', label: 'Owner Contact No.', type: 'text' },
      { id: 'owner_email', label: 'Owner Email', type: 'text', inputType: 'email' },
      { id: 'source_of_funds', label: 'Source of Funds', type: 'text' },
      {
        id: 'purpose_of_transaction',
        label: 'Purpose of Transaction',
        type: 'checkboxGroup',
        options: [
          { id: 'purpose_business_proceeds', label: 'Business Proceeds' },
          { id: 'purpose_inheritance', label: 'Inheritance' },
          { id: 'purpose_others', label: 'Others' },
        ],
      },
    ],
  },
  {
    title: 'Politically Exposed Persons (PEP) Declaration',
    fields: [
      {
        id: 'pep_declaration',
        label: 'Are any of the natural persons involved in your company persons holding or have held high public office, commonly known as "Politically Exposed Persons"?',
        type: 'radio',
        yesId: 'pep_yes',
        noId: 'pep_no',
      },
      { id: 'pep_name', label: 'If yes — Name', type: 'text' },
      { id: 'pep_relationship', label: 'If yes — Relationship', type: 'text' },
      { id: 'pep_title', label: 'If yes — Title', type: 'text' },
    ],
  },
  {
    title: 'Group Company Information (if applicable)',
    fields: [
      { id: 'group_company_name', label: 'Name of Company', type: 'text' },
      { id: 'group_company_nature', label: 'Nature of Association', type: 'text' },
    ],
  },
  {
    title: 'Ultimate Beneficial Owner',
    fields: [
      { id: 'ubo_name', label: 'Name of the Person', type: 'text' },
      { id: 'ubo_share_pct', label: 'Share %', type: 'text' },
      { id: 'ubo_identity_no', label: 'Identity No. (attach doc.)', type: 'text' },
      { id: 'ubo_id_type', label: 'ID Type (Passport/EID/Other)', type: 'text' },
    ],
  },
  {
    title: 'Compliance Questions',
    fields: [
      { id: 'compliance_1', label: 'Currently under any legal proceedings or pending judgment in the Court of Law?', type: 'radio', yesId: 'compliance_1_yes', noId: 'compliance_1_no' },
      { id: 'compliance_2', label: 'Convicted of or charged with a criminal offense in past 3 years?', type: 'radio', yesId: 'compliance_2_yes', noId: 'compliance_2_no' },
      { id: 'compliance_3', label: 'Found liable for negligence, fraud, wrongful trading, or malpractice?', type: 'radio', yesId: 'compliance_3_yes', noId: 'compliance_3_no' },
      { id: 'compliance_4', label: 'Subject to any application for, or declaration of, liquidation, bankruptcy, or similar proceedings or subject to an administrative order?', type: 'radio', yesId: 'compliance_4_yes', noId: 'compliance_4_no' },
      { id: 'compliance_5', label: 'Refused license or authorization to conduct business has been suspended, withdrawn, or not renewed?', type: 'radio', yesId: 'compliance_5_yes', noId: 'compliance_5_no' },
      { id: 'compliance_6', label: 'Censured, fined, disciplined, suspended, or refused membership by any regulatory body?', type: 'radio', yesId: 'compliance_6_yes', noId: 'compliance_6_no' },
      { id: 'compliance_specify', label: 'If yes to any of the above, please specify', type: 'text' },
    ],
  },
  {
    title: 'Documents Attached for Above KYC',
    fields: [
      {
        id: 'documents_attached',
        label: 'Select and upload the documents you are attaching (optional, but at least one is required)',
        type: 'checkboxGroup',
        allowUpload: true,
        options: [
          { id: 'doc_trade_license', label: 'Trade License copy' },
          { id: 'doc_moa_aoa', label: 'MOA and AOA' },
          { id: 'doc_share_certificate', label: 'Share Certificate' },
          { id: 'doc_business_reg', label: 'Business Registration Certificate' },
          { id: 'doc_vat_reg', label: 'VAT Registration Certificate' },
          { id: 'doc_tax_reg', label: 'Corporate TAX Registration Certificate' },
          { id: 'doc_cert_registration', label: 'Certificate of Registration' },
          { id: 'doc_extract_company', label: 'Extract of Company — Copy of shareholders/Directors/Manager' },
          { id: 'doc_passport', label: 'Passport' },
          { id: 'doc_visa', label: 'Visa (if applicable)' },
          { id: 'doc_emirates_id', label: 'Emirates ID' },
          { id: 'doc_other_id', label: 'Other ID (please specify)' },
        ],
      },
    ],
  },
  {
    title: 'Signer Details',
    fields: [
      { id: 'signer_name', label: 'Name', type: 'text', required: true },
      { id: 'signer_position', label: 'Position', type: 'text' },
      { id: 'company_stamp', label: 'Company Stamp (optional — you can also add this directly in DocuSign before signing)', type: 'stampUpload', required: false },
    ],
  },
];
