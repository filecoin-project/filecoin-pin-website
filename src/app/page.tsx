'use client'

import { NavWallet } from "@/components/nav-wallet";
import { FileUpload } from "@/components/file-upload";
import { PaymentSetup } from "@/components/payment-setup";
import { CarImport } from "@/components/car-import";
import { StatusDisplay } from "@/components/status-display";
import { Upload, FileArchive, Settings, Activity } from "lucide-react";
import { useState } from "react";

export default function Home() {
  const [activeTab, setActiveTab] = useState('upload')

  const tabs = [
    { id: 'upload', label: 'Upload Files', icon: Upload },
    { id: 'car-import', label: 'Import CAR', icon: FileArchive },
    { id: 'payments', label: 'Payments', icon: Settings },
    { id: 'status', label: 'Status', icon: Activity },
  ]

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 overflow-x-hidden">
      {/* Header */}
      <header className="border-b border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-3 sm:py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                <Upload className="w-5 h-5 text-white" />
              </div>
              <span className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
                Filecoin Pin
              </span>
            </div>
            <div className="flex items-center space-x-4 sm:space-x-6">
              <nav className="hidden md:flex items-center space-x-6">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
                      activeTab === tab.id
                        ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
                        : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    <tab.icon className="h-4 w-4" />
                    {tab.label}
                  </button>
                ))}
              </nav>
              <NavWallet />
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6 sm:py-8">
        {/* Mobile Navigation */}
        <div className="md:hidden mb-4 sm:mb-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex flex-col items-center justify-center gap-1 px-2 py-3 rounded-md text-xs sm:text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'bg-white text-blue-700 shadow-sm dark:bg-slate-700 dark:text-blue-300'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <tab.icon className="h-4 w-4" />
                <span className="text-center leading-tight">{tab.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Tab Content */}
        <div className="min-h-[500px] sm:min-h-[600px]">
          {activeTab === 'upload' && (
            <div>
              <div className="text-center mb-6 sm:mb-8">
                <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-slate-900 dark:text-white mb-3 sm:mb-4">
                  Upload Files to Filecoin
                </h1>
                <p className="text-base sm:text-lg text-slate-600 dark:text-slate-300 max-w-2xl mx-auto px-4">
                  Drag and drop files to pin them to the Filecoin network. 
                  Your files will be stored securely with cryptographic proofs.
                </p>
              </div>
              <FileUpload />
            </div>
          )}

          {activeTab === 'car-import' && (
            <div>
              <div className="text-center mb-6 sm:mb-8">
                <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-slate-900 dark:text-white mb-3 sm:mb-4">
                  Import CAR Files
                </h1>
                <p className="text-base sm:text-lg text-slate-600 dark:text-slate-300 max-w-2xl mx-auto px-4">
                  Import existing CAR (Content Addressed Archive) files directly to Filecoin storage.
                  Perfect for migrating from IPFS or other systems.
                </p>
              </div>
              <CarImport />
            </div>
          )}

          {activeTab === 'payments' && (
            <div>
              <div className="text-center mb-6 sm:mb-8">
                <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-slate-900 dark:text-white mb-3 sm:mb-4">
                  Payment Setup
                </h1>
                <p className="text-base sm:text-lg text-slate-600 dark:text-slate-300 max-w-2xl mx-auto px-4">
                  Configure USDFC deposits and storage allowances for Filecoin storage deals.
                  Required before storing files on the network.
                </p>
              </div>
              <PaymentSetup />
            </div>
          )}

          {activeTab === 'status' && (
            <div>
              <div className="text-center mb-6 sm:mb-8">
                <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-slate-900 dark:text-white mb-3 sm:mb-4">
                  System Status
                </h1>
                <p className="text-base sm:text-lg text-slate-600 dark:text-slate-300 max-w-2xl mx-auto px-4">
                  Monitor your storage deals, payment status, and system health.
                  Track your files across the Filecoin network.
                </p>
              </div>
              <StatusDisplay />
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
