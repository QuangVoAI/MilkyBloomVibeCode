import React, { useState, useEffect } from 'react'
import { Search, ShoppingCart, User, UserCircle, Package, LogOut, X, Menu, Home, Box, Layers, Info, Phone, ChevronDown } from 'lucide-react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { getCategories } from '@/services/categories.service'
import { useAuth } from '@/hooks/useAuth'
import { useCartContext } from '@/context/CartContext'
import OptimizedImage from '@/components/ui/OptimizedImage'
import './Navbar.css'

// Navigation links configuration
const NAV_LINKS = [
    { to: '/', label: 'HOME', icon: Home },
    { to: '/products', label: 'SHOP', icon: Box },
    { to: '/products', label: 'CATEGORIES', icon: Layers, isDropdown: true }, // Links to /products, shows dropdown
    { to: '/about', label: 'ABOUT', icon: Info },
    { to: '/contact', label: 'CONTACT', icon: Phone }
]

const USER_MENU_LINKS = [
    { to: '/profile', label: 'My Profile', icon: UserCircle },
    { to: '/order-history', label: 'Orders', icon: Package },
  // Settings removed
]

const Navbar = () => {
    const navigate = useNavigate()
    const { user, logout: authLogout } = useAuth()
    const { cartSummary } = useCartContext()
    const [showSearch, setShowSearch] = useState(false)
    const [searchQuery, setSearchQuery] = useState('')
    const [showMobileMenu, setShowMobileMenu] = useState(false)
    const [showMobileCategoryMenu, setShowMobileCategoryMenu] = useState(false)
    const [isVisible, setIsVisible] = useState(true)
    const [lastScrollY, setLastScrollY] = useState(0)
    const [categories, setCategories] = useState([])

    // Get cart count from the cart hook
    const cartCount = cartSummary?.itemCount || 0

    const handleScroll = () => {
        const currentScrollY = window.scrollY;
        
        // Always show at the very top
        if (currentScrollY < 10) {
            setIsVisible(true);
        } 
        // Hide when scrolling down (with small threshold to avoid jitter)
        else if (currentScrollY > lastScrollY + 5) {
            setIsVisible(false);
        } 
        // Show when scrolling up (even slightly)
        else if (currentScrollY < lastScrollY - 5) {
            setIsVisible(true);
        }
        
        setLastScrollY(currentScrollY);
    };

    const handleLogout = () => {
        authLogout()
        toast('Logged out successfully', {
            position: "top-center",
            className: "!bg-green-600 !text-white border border-green-700",
        })
        navigate('/')
    }

    const handleSearchClick = () => {
        setShowSearch(!showSearch)
        if (showSearch) {
            setSearchQuery('')
        }
    }

    const handleSearchSubmit = (e) => {
        e.preventDefault()
        if (searchQuery.trim()) {
            navigate(`/products?search=${encodeURIComponent(searchQuery.trim())}`)
            setShowSearch(false)
            setSearchQuery('')
        }
    }

    const handleSearchChange = (e) => {
        setSearchQuery(e.target.value)
    }

    const closeMobileMenu = () => {
        setShowMobileMenu(false)
        setShowMobileCategoryMenu(false) // Reset category submenu too
    }

    const handleCategoryClick = (categoryId) => {
        // Navigate first
        navigate(`/products?category=${categoryId}`);
        
        // Then scroll to products grid after short delay
        setTimeout(() => {
            const productsGrid = document.querySelector('.products-main');
            if (productsGrid) {
                productsGrid.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }, 100);
        
        // Close mobile menu if open
        setShowMobileCategoryMenu(false);
    }

    useEffect(() => {
        // Fetch categories only once on mount
        const fetchCategories = async () => {
            try {
                const data = await getCategories();
                setCategories(data || []);
            } catch (error) {
                console.error('Failed to fetch categories:', error);
                // Don't retry on error - categories are optional
            }
        };
        fetchCategories();
    }, []); // Empty deps - fetch only once

    // Separate effect for scroll listener
    useEffect(() => {
        window.addEventListener('scroll', handleScroll, { passive: true });

        return () => {
            window.removeEventListener('scroll', handleScroll);
        };
    });

    // Render mobile category menu
    const renderMobileCategoryMenu = () => (
        <div className={`mobile-category-menu ${showMobileCategoryMenu ? 'open' : ''}`}>
            <div className="mobile-category-header">
                <span className="category-menu-title">Categories</span>
                <button className="mobile-category-close" onClick={() => setShowMobileCategoryMenu(false)}>
                    <X size={20} />
                </button>
            </div>
            <div className="mobile-category-content">
                <div className="category-grid">
                    {categories.map((category) => (
                        <button
                            key={category._id}
                            onClick={() => handleCategoryClick(category._id)}
                            className="category-item"
                        >
                            <div className="category-image">
                                <OptimizedImage
                                    src={category.imageUrl || category.image || 'https://images.unsplash.com/photo-1566576721346-d4a3b4eaeb55?w=400&h=300&fit=crop'}
                                    alt={category.name}
                                    className="w-full h-full object-cover"
                                    containerClassName="w-full h-full"
                                    sizes="(max-width: 640px) 100vw, 400px"
                                    placeholder="blur"
                                    onError={(e) => {
                                        e.target.src = 'https://images.unsplash.com/photo-1566576721346-d4a3b4eaeb55?w=400&h=300&fit=crop';
                                    }}
                                />
                            </div>
                            <p className="category-name">{category.name}</p>
                        </button>
                    ))}
                </div>
            </div>
        </div>
    )

    // Render mobile menu
    const renderMobileMenu = () => (
        <div className={`mobile-menu ${showMobileMenu ? 'open' : ''}`}>
            <div className="mobile-menu-header">
                <span className="logo brand-logo">MilkyBloom</span>
                <button className="mobile-menu-close" onClick={closeMobileMenu}>
                    <X size={20} />
                </button>
            </div>
            <div className="mobile-menu-content">
                {/* User Section */}
                <div className="mobile-user-section">
                    {user ? (
                        <div className="mobile-user-info">
                            <div className="user-avatar">
                                {user.fullname?.charAt(0)?.toUpperCase() || user.username?.charAt(0)?.toUpperCase() || 'U'}
                            </div>
                            <div className="mobile-user-details">
                                <div className="mobile-user-name">{user.fullname || user.username || 'User'}</div>
                                <div className="mobile-user-email">{user.email || ''}</div>
                                {user.role === 'admin' && (
                                    <span className="mobile-user-role">Admin</span>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="mobile-auth-buttons">
                            <Link to="/login" className="login-btn" onClick={closeMobileMenu}>Login</Link>
                            <Link to="/register" className="signup-btn" onClick={closeMobileMenu}>Sign Up</Link>
                        </div>
                    )}
                </div>

                <div className="mobile-divider" />

                {/* Navigation Links */}
                <ul className="mobile-nav-links">
                    {NAV_LINKS.map((link) => (
                        <li key={link.label}>
                            {link.isDropdown ? (
                                // Categories with expandable submenu
                                <>
                                    <button
                                        className="mobile-nav-button mobile-category-toggle"
                                        onClick={() => setShowMobileCategoryMenu(!showMobileCategoryMenu)}
                                    >
                                        <span className="mobile-nav-button-content">
                                            {React.createElement(link.icon, { size: 20 })}
                                            {link.label.charAt(0) + link.label.slice(1).toLowerCase()}
                                        </span>
                                        <ChevronDown 
                                            size={16} 
                                            className={`mobile-category-arrow ${showMobileCategoryMenu ? 'open' : ''}`}
                                        />
                                    </button>
                                    {showMobileCategoryMenu && (
                                        <ul className="mobile-category-submenu">
                                            {categories.slice(0, 8).map((category) => (
                                                <li key={category._id}>
                                                    <button
                                                        className="mobile-category-item"
                                                        onClick={() => {
                                                            navigate(`/products?category=${category._id}`);
                                                            closeMobileMenu();
                                                        }}
                                                    >
                                                        {category.name}
                                                    </button>
                                                </li>
                                            ))}
                                            <li>
                                                <NavLink 
                                                    to="/products" 
                                                    onClick={closeMobileMenu}
                                                    className="mobile-category-view-all"
                                                >
                                                    View all →
                                                </NavLink>
                                            </li>
                                        </ul>
                                    )}
                                </>
                            ) : (
                                <NavLink to={link.to} onClick={closeMobileMenu}>
                                    {React.createElement(link.icon, { size: 20 })}
                                    {link.label.charAt(0) + link.label.slice(1).toLowerCase()}
                                </NavLink>
                            )}
                        </li>
                    ))}
                </ul>

                {user && (
                    <>
                        <div className="mobile-divider" />
                        <ul className="mobile-nav-links">
                            {/* eslint-disable-next-line no-unused-vars */}
                            {USER_MENU_LINKS.map(({ to, label, icon: Icon }) => (
                                <li key={to}>
                                    <NavLink to={to} onClick={closeMobileMenu}>
                                        <Icon size={20} />
                                        {label}
                                    </NavLink>
                                </li>
                            ))}
                            <li>
                                <button
                                    onClick={() => {
                                        handleLogout()
                                        closeMobileMenu()
                                    }}
                                    style={{
                                        width: '100%',
                                        textAlign: 'left',
                                        background: 'none',
                                        border: 'none',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '12px',
                                        padding: '1rem 1.5rem',
                                        color: '#ef4444',
                                        fontSize: '1rem',
                                        fontWeight: 500,
                                    }}
                                >
                                    <LogOut size={20} />
                                    Logout
                                </button>
                            </li>
                        </ul>
                    </>
                )}
            </div>
        </div>
    )

    // Render desktop navigation links
    const renderDesktopNav = () => (
        <ul className='hidden sm:flex gap-5 text-sm text-gray-700'>
            {NAV_LINKS.map(({ to, label, isDropdown }) => {
                // Special handling for CATEGORIES with dropdown
                if (isDropdown) {
                    return (
                        <li key={label} className='nav-link-item group relative'>
                            <div className='flex items-center gap-1 cursor-pointer'>
                                <p>{label}</p>
                                <ChevronDown size={14} className='transition-transform group-hover:rotate-180' />
                            </div>
                            <hr className='nav-link-underline w-2/4 border-none h-[1.5px] bg-gray-700' />
                            
                            {/* Mega Dropdown Menu */}
                            <div className='nav-mega-dropdown group-hover:block hidden absolute top-full left-1/2 -translate-x-1/2 pt-4 z-[1100]'>
                                <div className='nav-mega-dropdown-panel bg-white rounded-xl shadow-2xl border border-gray-100 p-5 sm:p-6'>
                                    <div className='grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4'>
                                        {categories.slice(0, 12).map((category) => (
                                            <button
                                                key={category._id}
                                                className='group/item flex flex-col gap-2 p-2 hover:bg-orange-50 transition-all text-left'
                                                onClick={() => handleCategoryClick(category._id)}
                                            >
                                                <div className='w-full h-20 overflow-hidden bg-gray-100'>
                                                    <OptimizedImage
                                                        src={category.imageUrl || category.image || 'https://images.unsplash.com/photo-1566576721346-d4a3b4eaeb55?w=400&h=300&fit=crop'}
                                                        alt={category.name}
                                                        className='w-full h-full object-cover group-hover/item:scale-110 transition-transform duration-300'
                                                        containerClassName="w-full h-full"
                                                        sizes="200px"
                                                        placeholder="blur"
                                                        onError={(e) => {
                                                            e.target.src = 'https://images.unsplash.com/photo-1566576721346-d4a3b4eaeb55?w=400&h=300&fit=crop';
                                                        }}
                                                    />
                                                </div>
                                                <p className='font-semibold text-xs text-gray-900 group-hover/item:text-orange-600 transition-colors text-center'>
                                                    {category.name}
                                                </p>
                                            </button>
                                        ))}
                                        
                                        {/* View All Button */}
                                        <Link
                                            to='/products'
                                            className='group/item flex flex-col gap-2 p-2 hover:bg-orange-50 transition-all'
                                            onClick={() => {
                                                setTimeout(() => {
                                                    const productsGrid = document.querySelector('.products-main');
                                                    if (productsGrid) {
                                                        productsGrid.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                                    }
                                                }, 100);
                                            }}
                                        >
                                            <div className='w-full h-20 overflow-hidden bg-gray-50 flex items-center justify-center'>
                                                <svg 
                                                    className='w-10 h-10 text-gray-700 group-hover/item:text-orange-600 group-hover/item:scale-110 transition-all duration-300' 
                                                    fill="currentColor" 
                                                    viewBox="0 0 606.877 606.877"
                                                >
                                                    <g>
                                                        <path d="M58.64,280.154h162.654c32.058,0,58.14-26.082,58.14-58.14V59.36c0-32.059-26.082-58.14-58.14-58.14H58.64 C26.582,1.22,0.5,27.301,0.5,59.36v162.654C0.5,254.072,26.582,280.154,58.64,280.154z M43.34,59.36c0-8.45,6.85-15.3,15.3-15.3 h162.654c8.45,0,15.3,6.85,15.3,15.3v162.654c0,8.45-6.85,15.3-15.3,15.3H58.64c-8.45,0-15.3-6.85-15.3-15.3V59.36z"/>
                                                        <path d="M548.238,1.22H385.584c-32.059,0-58.141,26.082-58.141,58.14v162.654c0,32.058,26.082,58.14,58.141,58.14h162.654 c32.059,0,58.139-26.082,58.139-58.14V59.36C606.377,27.301,580.297,1.22,548.238,1.22z M563.537,222.014 c0,8.45-6.85,15.3-15.299,15.3H385.584c-8.449,0-15.301-6.85-15.301-15.3V59.36c0-8.45,6.852-15.3,15.301-15.3h162.654 c8.449,0,15.299,6.85,15.299,15.3V222.014z"/>
                                                        <path d="M58.64,605.657h162.654c32.058,0,58.14-26.08,58.14-58.139V384.864c0-32.059-26.082-58.141-58.14-58.141H58.64 c-32.058,0-58.14,26.082-58.14,58.141v162.654C0.5,579.577,26.582,605.657,58.64,605.657z M43.34,384.864 c0-8.449,6.85-15.301,15.3-15.301h162.654c8.45,0,15.3,6.852,15.3,15.301v162.654c0,8.449-6.85,15.299-15.3,15.299H58.64 c-8.45,0-15.3-6.85-15.3-15.299V384.864z"/>
                                                        <path d="M548.238,326.724H385.584c-32.059,0-58.141,26.082-58.141,58.141v162.654c0,32.059,26.082,58.139,58.141,58.139h162.654 c32.059,0,58.139-26.08,58.139-58.139V384.864C606.377,352.806,580.297,326.724,548.238,326.724z M563.537,547.519 c0,8.449-6.85,15.299-15.299,15.299H385.584c-8.449,0-15.301-6.85-15.301-15.299V384.864c0-8.449,6.852-15.301,15.301-15.301 h162.654c8.449,0,15.299,6.852,15.299,15.301V547.519z"/>
                                                    </g>
                                                </svg>
                                            </div>
                                            <p className='font-semibold text-xs text-gray-900 group-hover/item:text-orange-600 transition-colors text-center'>
                                                View All
                                            </p>
                                        </Link>
                                    </div>
                                    
                                    {categories.length > 12 && (
                                        <div className='mt-4 pt-4 border-t border-gray-100 text-center'>
                                            <Link
                                                to='/products'
                                                className='text-xs font-semibold text-orange-600 hover:text-orange-700 transition-colors'
                                                onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                                            >
                                                View all categories →
                                            </Link>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </li>
                    );
                }
                
                // Regular nav links
                return (
                    <NavLink 
                        key={to} 
                        to={to} 
                        className={({ isActive }) => 
                            `nav-link-item text-sm md:text-base font-semibold tracking-tight ${isActive ? 'nav-link-active' : ''}`
                        }
                    >
                        <p className="leading-none">{label}</p>
                        <hr className='nav-link-underline border-none h-[1.5px] bg-gray-700' />
                    </NavLink>
                );
            })}
        </ul>
    )

    // Render search bar
    const renderSearchBar = () => (
        showSearch ? (
            <form onSubmit={handleSearchSubmit} className='navbar-search-form expanded flex items-center gap-2 border border-gray-300 rounded-full px-3 py-1.5 bg-white shadow-sm'>
                <Search className='w-4 h-4 text-gray-500 flex-shrink-0' />
                <input
                    type='text'
                    value={searchQuery}
                    onChange={handleSearchChange}
                    placeholder='Search products...'
                    className='outline-none text-sm flex-1 min-w-0 bg-transparent'
                    autoFocus
                />
                <X 
                    className='w-4 h-4 cursor-pointer text-gray-500 hover:text-gray-700 flex-shrink-0' 
                    onClick={handleSearchClick}
                />
            </form>
        ) : (
            <button 
                className='navbar-icon-btn flex items-center justify-center w-10 h-10 rounded-full hover:bg-gray-100 transition-colors'
                onClick={handleSearchClick}
                aria-label="Search"
            >
                <Search className='w-5 h-5' />
            </button>
        )
    )

    const [showUserMenu, setShowUserMenu] = useState(false);

    // Render user dropdown menu - with mobile click support
    const renderUserMenu = () => (
        <div className='navbar-user-menu relative'>
            <button 
                className='navbar-icon-btn flex items-center justify-center w-10 h-10 rounded-full hover:bg-gray-100 transition-colors'
                aria-label="User menu"
                onClick={() => setShowUserMenu(!showUserMenu)}
            >
                <User className='w-5 h-5' />
            </button>
            {showUserMenu && (
                <>
                    <div className='fixed inset-0 z-[1050]' onClick={() => setShowUserMenu(false)} />
                    <div className='z-[1100] absolute dropdown-menu right-0 pt-2'>
                        <div className='flex flex-col w-56 py-2 bg-white border border-gray-200 rounded-lg shadow-lg'>
                            {user ? (
                                <>
                                    <div className='px-4 py-3 border-b border-gray-100'>
                                        <p className='text-sm font-semibold text-gray-900'>{user.fullname || user.username || 'User'}</p>
                                        <p className='text-xs text-gray-500 mt-1'>{user.email || ''}</p>
                                        {user.role === 'admin' && (
                                            <Link
                                                to="/admin"
                                                onClick={() => setShowUserMenu(false)}
                                                className='inline-flex items-center gap-2 mt-1 px-2 py-0.5 text-[11px] font-semibold text-white bg-indigo-500 rounded hover:bg-indigo-600 transition'
                                            >
                                                <span>Admin</span>
                                            </Link>
                                        )}
                                    </div>
                                    <div className='py-1'>
                                        {/* eslint-disable-next-line no-unused-vars */}
                                        {USER_MENU_LINKS.map(({ to, label, icon: Icon }) => (
                                            <Link key={to} to={to} onClick={() => setShowUserMenu(false)} className='flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors'>
                                                <Icon className='w-4 h-4' />
                                                <span>{label}</span>
                                            </Link>
                                        ))}
                                    </div>
                                    <div className='border-t border-gray-100 py-1'>
                                        <button onClick={() => { setShowUserMenu(false); handleLogout(); }} className='flex items-center gap-3 w-full px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors'>
                                            <LogOut className='w-4 h-4' />
                                            <span>Logout</span>
                                        </button>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div className='px-4 py-3 border-b border-gray-100'>
                                        <p className='text-sm font-semibold text-gray-900'>Welcome!</p>
                                        <p className='text-xs text-gray-500 mt-1'>Sign in to your account</p>
                                    </div>
                                    <div className='py-1'>
                                        <Link to='/login' onClick={() => setShowUserMenu(false)} className='flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors'>
                                            <UserCircle className='w-4 h-4' />
                                            <span>Login</span>
                                        </Link>
                                        <Link to='/register' onClick={() => setShowUserMenu(false)} className='flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors'>
                                            <User className='w-4 h-4' />
                                            <span>Sign Up</span>
                                        </Link>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </>
            )}
        </div>
    )

    // Render cart icon
    const renderCart = () => (
        <Link to='/cart' className='navbar-icon-btn relative flex items-center justify-center w-10 h-10 rounded-full hover:bg-gray-100 transition-colors'>
            <ShoppingCart className='w-5 h-5' />
            {cartCount > 0 && (
                <span className='absolute top-0 right-0 w-5 h-5 text-center leading-5 bg-black text-white rounded-full text-[10px] font-medium'>
                    {cartCount > 99 ? '99+' : cartCount}
                </span>
            )}
        </Link>
    )

    return (
        <>
            {/* Mobile Menu Overlay */}
            {showMobileMenu && (
                <div className="mobile-menu-overlay" onClick={closeMobileMenu} />
            )}

            {/* Mobile Category Menu Overlay */}
            {showMobileCategoryMenu && (
                <div className="mobile-menu-overlay" onClick={() => setShowMobileCategoryMenu(false)} />
            )}

            {/* Mobile Menu */}
            {renderMobileMenu()}

            {/* Mobile Category Menu */}
            {renderMobileCategoryMenu()}

            {/* Main Navbar */}
            <nav className={`navbar-wrapper ${isVisible ? 'navbar-visible' : 'navbar-hidden'}`}>
                <div className='navbar-container px-3 sm:px-4 md:px-[5vw] lg:px-[7vw] xl:px-[3vw]'>
                    <div className='navbar-content flex items-center justify-between py-4 font-medium gap-4'>
                        {/* Mobile Menu Toggle */}
                        <button 
                            className="mobile-menu-toggle flex-shrink-0" 
                            onClick={() => showMobileMenu ? closeMobileMenu() : setShowMobileMenu(true)}
                        >
                            {showMobileMenu ? <X size={24} /> : <Menu size={24} />}
                        </button>

                        {/* Logo - hidden when search is expanded on mobile */}
                        <Link to='/' className={`navbar-logo text-4xl brand-logo flex-shrink-0 flex items-center ${showSearch ? 'navbar-logo-hidden' : ''}`}>
                            MilkyBloom
                        </Link>

                        {/* Desktop Navigation */}
                        {renderDesktopNav()}

                        {/* Right Side Icons */}
                        <div className='navbar-actions flex items-center gap-1 sm:gap-2'>
                            {renderSearchBar()}
                            {renderUserMenu()}
                            {renderCart()}
                        </div>
                    </div>
                </div>
            </nav>
        </>
    )
}

export default Navbar
