import {useRef, useState, useEffect} from "react";
import {BsExclamationTriangle, BsCheckCircleFill, BsThreeDotsVertical} from "react-icons/bs";
import {MdOutlineFileUpload} from "react-icons/md";
import {FiCopy} from "react-icons/fi";
import {uploadVC, getVCStatus, deleteVC} from "../../services/api.js";

export const SettingsTab = () => {
    const [step, setStep] = useState(0);
    const [uploading, setUploading] = useState(false);
    const [uploadError, setUploadError] = useState(null);
    const [copied, setCopied] = useState(false);
    const [vcInfo, setVcInfo] = useState(null);
    const [loading, setLoading] = useState(true);
    const [showMenu, setShowMenu] = useState(false);
    const fileInputRef = useRef(null);
    const menuRef = useRef(null);

    // Close menu when clicking outside
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (menuRef.current && !menuRef.current.contains(e.target)) {
                setShowMenu(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Check for existing VC on mount
    useEffect(() => {
        const checkVC = async () => {
            try {
                const result = await getVCStatus();
                if (result.hasVC) {
                    setVcInfo(result.vc);
                    setStep(3);
                }
            } catch (err) {
                console.error('Failed to check VC status:', err);
            } finally {
                setLoading(false);
            }
        };
        checkVC();
    }, []);

    const publicKey = vcInfo?.subject?.id || 'did:web:example.com#key-1';

    const handleCopy = async () => {
        await navigator.clipboard.writeText(publicKey);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleUploadClick = () => {
        fileInputRef.current.click();
    };

    const handleFileChange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setUploading(true);
        setUploadError(null);

        try {
            const text = await file.text();
            const vc = JSON.parse(text);
            const result = await uploadVC(vc);
            setVcInfo(result.vc);
            setStep(2);
        } catch (err) {
            setUploadError(err.message || 'Upload failed');
        } finally {
            setUploading(false);
        }
    };

    const handleDeleteVC = async () => {
        try {
            await deleteVC();
            setVcInfo(null);
            setStep(0);
        } catch (err) {
            setUploadError(err.message || 'Delete failed');
        }
    };

    if (loading) {
        return (
            <div className="settings-tab">
                <div className="settings-balloon">
                    <h4>Settings</h4>
                    <div className="settings-balloon-body">
                        <div className="w-50 m-4 d-flex flex-column align-items-center">
                            <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="settings-tab">
          <div className="settings-balloon">
              <h4>Settings</h4>
              <div className="settings-balloon-body">
                  <div className="w-50 m-4 d-flex flex-column">
                      {step === 0 && (
                          <>
                              <div className="d-flex align-items-center mb-3">
                                  <BsExclamationTriangle color="#A16207" size={16} className="me-2" />
                                  <h6 className="mb-0">Digital Identity</h6>
                              </div>
                              <p className="text-muted mb-5">
                                Enable automated identity verification for NDC requests by linking your agency's Digital Credential and signing key
                              </p>
                              <button className="settings-setup-btn mt-auto" onClick={() => setStep(1)}>Set Up Travel Agency Digital Credential</button>
                          </>
                      )}
                      {step === 1 && (
                          <>
                              <div className="d-flex align-items-center mb-3">
                                  <h6 className="mb-0">Step 1: Upload your IATA Digital Credential</h6>
                              </div>
                              <p className="text-muted mb-5">
                                Please Upload the IATA issued Digital Credential to your agency
                              </p>
                              <input
                                  type="file"
                                  accept=".json"
                                  ref={fileInputRef}
                                  onChange={handleFileChange}
                                  className="d-none"
                              />
                              <button className="settings-setup-btn mt-auto d-flex align-items-center justify-content-center" onClick={handleUploadClick} disabled={uploading}>
                                  {uploading ? (
                                      <><span className="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>Uploading...</>
                                  ) : (
                                      <><img src="/iata_logo.svg.svg" alt="IATA" style={{height: 20, marginRight: 8}} />Upload IATA Digital Credential</>
                                  )}
                              </button>
                          </>
                      )}
                      {step === 2 && (
                          <>
                              <div className="d-flex align-items-center mb-3">
                                  <BsCheckCircleFill color="#059669" size={16} className="me-2" />
                                  <h6 className="mb-0">IATA Digital Credential successfully provisioned</h6>
                              </div>
                              <p className="text-muted mb-3">
                                  Agency IATA Digital Credential has been successfully linked to the booking system. Please review the confirmed details below:
                              </p>
                              {vcInfo && (
                                  <div className="mb-4">
                                      <small className="text-muted d-block"><strong>Agency:</strong> {vcInfo.subject?.name}</small>
                                      <small className="text-muted d-block"><strong>IATA Number:</strong> {vcInfo.subject?.iataNumber}</small>
                                  </div>
                              )}
                              <button className="settings-setup-btn mt-auto" onClick={() => setStep(3)}>Continue</button>
                          </>
                      )}
                      {step === 3 && (
                          <>
                              <div className="d-flex align-items-center justify-content-between mb-3">
                                  <h6 className="mb-0">Step 2: Authorize this Booking System</h6>
                                  <div className="position-relative" ref={menuRef}>
                                      <button
                                          className="btn btn-link text-muted p-0"
                                          onClick={() => setShowMenu(!showMenu)}
                                          title="Options"
                                      >
                                          <BsThreeDotsVertical size={18} />
                                      </button>
                                      {showMenu && (
                                          <div className="position-absolute end-0 mt-1 bg-white border rounded shadow-sm" style={{zIndex: 10, minWidth: 150}}>
                                              <button className="dropdown-item px-3 py-2 text-start w-100" onClick={() => { setShowMenu(false); setStep(1); }}>Replace VC</button>
                                              <button className="dropdown-item px-3 py-2 text-start w-100 text-danger" onClick={() => { setShowMenu(false); handleDeleteVC(); }}>Delete VC</button>
                                          </div>
                                      )}
                                  </div>
                              </div>
                              <p className="text-muted mb-3">
                                  A new cryptographic key pair has been generated for this booking system.
                                  To authorize this booking system to create proofs on your agency's behalf, please add the following public key to your organization's wallet.
                              </p>
                              <h6 className="mb-2">Public Key:</h6>
                              <div className="d-flex mb-4">
                                  <input
                                      type="text"
                                      className="form-control"
                                      value={publicKey}
                                      readOnly
                                  />
                                  <button className="btn btn-outline-secondary ms-2" onClick={handleCopy} title={copied ? 'Copied!' : 'Copy'}>
                                      <FiCopy />
                                  </button>
                              </div>
                              <button className="settings-setup-btn mt-auto" onClick={() => setStep(4)}>I've added the key</button>
                          </>
                      )}
                      {step === 4 && (
                          <>
                              <div className="d-flex flex-column align-items-center text-center mt-4 mb-4">
                                  <BsCheckCircleFill color="#059669" size={48} className="mb-3" />
                                  <h5 className="mb-3">Travel Agency Digital Credential setup completed successfully</h5>
                                  <p className="text-muted">
                                      Your agency's Digital Credential has been fully configured. You can now execute NDC aggregation searches with automated identity verification.
                                  </p>
                              </div>
                              <div className="d-flex justify-content-center mt-auto">
                                  <button className="settings-setup-btn" onClick={() => setStep(3)}>View Configuration</button>
                              </div>
                          </>
                      )}
                  </div>
              </div>
              {uploadError && (
                  <div className="alert alert-danger mt-3" role="alert">
                      <strong>Error:</strong> {uploadError}
                  </div>
              )}
          </div>
          <img className="settings-globe" src="/globe_graphic.png" alt="Globe graphic"/>
        </div>
    );
};
