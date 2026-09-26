from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, ForeignKey, text
from sqlalchemy.orm import relationship
from datetime import timezone, datetime
from app.database import Base

class Branch(Base):
    __tablename__ = "branches"
    
    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=True, index=True)
    name = Column(String, nullable=False)          # e.g., "Orchid Main", "Orchid Beach"
    code = Column(String, unique=True, nullable=False, index=True) # e.g., "MAIN", "BEACH"
    address = Column(Text, nullable=True)
    phone = Column(String, nullable=True)
    email = Column(String, nullable=True)
    gst_number = Column(String, nullable=True)
    image_url = Column(String, nullable=True)      # Main image for the branch/resort
    facebook = Column(String, nullable=True)
    instagram = Column(String, nullable=True)
    twitter = Column(String, nullable=True)
    linkedin = Column(String, nullable=True)
    location = Column(String, nullable=True)
    is_active = Column(Boolean, nullable=False, default=True, server_default=text('true'))
    created_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc), server_default=text('CURRENT_TIMESTAMP'))
    
    tenant = relationship("Tenant", back_populates="branches")

    def __repr__(self):
        return f"<Branch id={self.id} name={self.name} code={self.code}>"
