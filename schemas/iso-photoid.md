# Table format of namespaces and their data elements

## Base data elements for photoid namespace org.iso.23220.1 defined in ISO/IEC 23220-4 table C.1
| Identifier               | Definition                                                                                                                                                         | Encoding  | Presence |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- | -------- |
| family_name              | Last name, surname, or primary identifier, of the holder.                                                                                                          | tstr      | M        |
| given_name               | First name(s), other name(s), or secondary identifier, of the holder.                                                                                              | tstr      | M        |
| family_name_viz          | Family name as defined for VIZ (visual inspection zone) in ICAO 9303.                                                                                              | tstr      | O        |
| given_name_viz           | Given name as defined for VIZ (visual inspection zone) in ICAO 9303.                                                                                               | tstr      | O        |
| birth_date               | Day, month and year on which the holder was born in full-date format (YYYY-MM-DD) as per ISO 8601-1. If parts are unknown, issuing authority picks one exact date. | full-date | M        |
| portrait                 | Portrait data encoded as JPEG or JPEG 2000 as specified in ISO/IEC 18013-2:2020.                                                                                   | bstr      | M        |
| enrolment_portrait_image | Enrolment portraitimage as JPEG or JPEG 2000.                                                                                                                      | bstr      | O        |
| issue_date               | Date mobile eID document was issued                                                                                                                                | full-date | M        |
| expiry_date              | Date mobile eID document expires.                                                                                                                                  | full-date | M        |
| issuing_authority        | Name of issuing authority.                                                                                                                                         | tstr      | M        |
| issuing_country          | Country code as alpha 2 and alpha 3 code, defined in ISO 3166-1, which issued the mobile eID document or within which the issuing authority is located.            | tstr      | M        |
| age_over_18              | Age of holder is greater than 18 years.                                                                                                                            | bool      | M        |
| age_in_years             | The age of the holder.                                                                                                                                             | uint      | R        |
| age_over_NN              | Check ISO/IEC 23220-2 Section 6.3.2.2. Age attestation: Nearest “true” attestation above request.                                                                  | bool      | R        |
| age_birth_year           | The year when the holder was born.                                                                                                                                 | uint      | R        |
| portrait_capture_date    | Date when portrait was taken.                                                                                                                                      | tdate     | O        |
| birthplace               | Country and municipality or state/province where the holder was born.                                                                                              | tstr      | O        |
| name_at_birth            | The name(s)which holder was born                                                                                                                                   | tstr      | O        |
| resident_address         | The place where the holder resides and/or may be contacted (street/house number, municipality etc.).                                                               | tstr      | O        |
| resident_city            | The city/municipality (or equivalent) where the holder lives.                                                                                                      | tstr      | O        |
| resident_postal_code     | The postal code of the holder                                                                                                                                      | tstr      | O        |
| resident_country         | The country where the holder lives as a two letter country code (alpha-2 code) defined in ISO 3166-1.                                                              | tstr      | O        |
| resident_city_latin1     | The city/municipality (or equivalent) where the holder lives, Latin 1 characters.                                                                                  | tstr      | O        |
| sex                      | Holder’s sex using values as defined in ISO/IEC 5218.                                                                                                              | uint      | O        |
| nationality              | Nationality of the Holder as two letter country code (alpha-2 code) or three letter code (alpha-3 code) defined in ISO 3166-1.                                     | tstr      | O        |
| document_number          | The number assigned or calculated by the issuing authority.                                                                                                        | tstr      | O        |
| issuing_subdivision      | Subdivision code as defined in ISO 3166-2, which issued the mobile eID document or within which the issuing authority located.                                     | tstr      | O        |
| family_name_latin1       | Last name, surname, or primary identifier, of the holder, Latin1 characters.                                                                                       | tstr      | O        |
| given_name_latin1        | First name(s), other name(s), or secondary identifier, of the holder. Latin1 characters                                                                            | tstr      | O        |


## Additional data elements for photo ID namespace org.iso.23220.photoid.1 defined in ISO/IEC 23220-4 table C.2

| Identifier             | Definition                                                                                                                                                                                                                                                   | Encoding | Presence |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | -------- |
| person_id              | Person identifier of the photo ID holder.                                                                                                                                                                                                                    | tstr     | O        |
| birth_country          | The country where the photo ID holder was born, as an Alpha-2 country code as specified in ISO 3166-1.                                                                                                                                                       | tstr     | O        |
| birth_state            | The state, province, district or local area where the photo ID holder was born.                                                                                                                                                                              | tstr     | O        |
| birth_city             | The municipality, city, town or village wher ethe Photo ID holder was born.                                                                                                                                                                                  | tstr     | O        |
| administrative_number  | A number assigned by the photo ID holder issuer for audit control or other purposes.                                                                                                                                                                         | tstr     | O        |
| resident_street        | The name of the street where the photo ID holder currently resides.                                                                                                                                                                                          | tstr     | O        |
| resident_house_number  | The house number wher ethe photo ID holder currently resides, including any affix or suffix.                                                                                                                                                                 | tstr     | O        |
| travel_document_type   | Identifier of the type of source document, (if associated to or derived from a travel document). e.g. the two letters from MRZ as defined by ICAO 9303 amd 1 section 4.4) shall be present if dg1 data element from table C.3 exists but optional otherwise. | tstr     | C        |
| travel_document_number | The number of the travel document to which the photo ID is associated (if associated to or derived from a travel document).                                                                                                                                  | tstr     | O        |
| resident_state         | The state/province/district where the mDL holder lives. The value shall only use latin1b characters and shall have a maximum length of 150 characters.                                                                                                       | tstr     | O        |
| travel_document_mrz    | Machine readable zone as the text printed on the physical document. It shall be present if dg1 data element from table C.3 exists but optional otherwise.                                                                                                    | tstr     | C        |

## Data elements containing the data groups defined by ICAO 9303 and referenced in ISO/IEC 23220-4 table C.3
| Identifier | Definition                                            | Encoding | Presence |
| ---------- | ----------------------------------------------------- | -------- | -------- |
| version    | Version identifier for the ICAO 9303 data groups.     | tstr     | O        |
| dg1        | Data Group 1: Biographic data (data recorded in MRZ). | bstr     | C        |
| dg2        | Data Group 2: Reference portrait (encoded face).      | bstr     | C        |
| dg3        | Data Group 3: Encoded fingers.                        | bstr     | O        |
| dg4        | Data Group 4: Encoded eye(s).                         | bstr     | O        |
| dg5        | Data Group 5: Displayed portrait.                     | bstr     | O        |
| dg6        | Data Group 6: Reserved for future use.                | bstr     | O        |
| dg7        | Data Group 7: Displayed signature or usual mark.      | bstr     | O        |
| dg8        | Data Group 8: Data feature(s).                        | bstr     | O        |
| dg9        | Data Group 9: Structure feature(s).                   | bstr     | O        |
| dg10       | Data Group 10: Substance feature(s).                  | bstr     | O        |
| dg11       | Data Group 11: Additional personal detail(s).         | bstr     | O        |
| dg12       | Data Group 12: Additional document detail(s).         | bstr     | O        |
| dg13       | Data Group 13: Optional detail(s).                    | bstr     | O        |
| dg14       | Data Group 14: Security options.                      | bstr     | O        |
| dg15       | Data Group 15: Active authentication public key info. | bstr     | O        |
| dg16       | Data Group 16: Person(s) to notify.                   | bstr     | O        |
| sod        | Security Object Data (SOD).                           | bstr     | C        |
